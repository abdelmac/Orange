"""Validate the inputs and signing identity of the manual iOS release workflow.

Uses only the Python standard library; never prints signing material.
"""

import base64
import datetime as dt
import hashlib
import os
from pathlib import Path
import plistlib
import re
import subprocess
import sys
import uuid


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_inputs(values):
    require(re.fullmatch(r"[A-Z0-9]{10}", values.get("APPLE_TEAM_ID", "")),
            "Set APPLE_TEAM_ID to your 10-character Apple Team ID.")
    bundle = values.get("IOS_BUNDLE_ID", "")
    require(len(bundle) <= 255 and re.fullmatch(r"[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+", bundle),
            "Set IOS_BUNDLE_ID to the explicit identifier registered with Apple.")
    require(re.fullmatch(r"(?:0|[1-9][0-9]{0,3})(?:\.(?:0|[1-9][0-9]{0,3})){2}",
                         values.get("APP_VERSION", "")),
            "Version must contain three integers, e.g. 1.0.0 (maximum 4 digits per part).")
    # Conservative App Store release format: 1-9999, optionally .0-99 and .0-99.
    require(re.fullmatch(r"[1-9][0-9]{0,3}(?:\.(?:0|[1-9][0-9]?)){0,2}",
                         values.get("APP_BUILD_NUMBER", "")),
            "Build number must be 1-9999, optionally followed by one or two .0-99 parts.")


def validate_profile(profile, identities, team, bundle, now=None):
    now = now or dt.datetime.now(dt.timezone.utc)
    expires = profile.get("ExpirationDate")
    require(isinstance(expires, dt.datetime), "Provisioning profile has no expiration date.")
    require(expires.replace(tzinfo=dt.timezone.utc) > now, "Provisioning profile has expired.")
    require(team in profile.get("TeamIdentifier", []), "Profile belongs to a different Apple team.")
    require("iOS" in profile.get("Platform", []), "An iOS provisioning profile is required.")
    entitlements = profile.get("Entitlements", {})
    require(entitlements.get("com.apple.developer.team-identifier") == team,
            "Profile entitlement belongs to a different team.")
    app_identifier = entitlements.get("application-identifier", "")
    prefix, _, app_bundle = app_identifier.partition(".")
    require(app_bundle == bundle and prefix in profile.get("ApplicationIdentifierPrefix", []),
            "Profile does not match the exact bundle identifier.")
    require(entitlements.get("get-task-allow") is False
            and entitlements.get("beta-reports-active") is True
            and not profile.get("ProvisionedDevices")
            and not profile.get("ProvisionsAllDevices"),
            "Use an App Store Connect distribution profile, not development, ad hoc or enterprise.")
    profile_id = str(uuid.UUID(profile.get("UUID", ""))).upper()
    valid_identities = re.findall(
        r'\b([A-Fa-f0-9]{40})\s+"(?:Apple Distribution|iPhone Distribution):[^"\n]+"', identities
    )
    certificate_hashes = {
        hashlib.sha1(certificate).hexdigest().upper()
        for certificate in profile.get("DeveloperCertificates", [])
        if isinstance(certificate, bytes)
    }
    matches = [value.upper() for value in valid_identities if value.upper() in certificate_hashes]
    require(len(matches) == 1,
            "Profile must contain exactly one valid distribution identity with its private key in the keychain.")
    return profile_id, matches[0]


def signing_directory():
    root = Path(os.environ["RUNNER_TEMP"]).resolve()
    directory = (root / "orange-ios-signing").resolve()
    require(directory.parent == root, "Unexpected signing directory.")
    return directory


def prepare():
    directory = signing_directory()
    directory.mkdir(mode=0o700)
    for variable, filename in [
        ("IOS_DISTRIBUTION_P12_BASE64", "distribution.p12"),
        ("IOS_PROVISION_PROFILE_BASE64", "profile.mobileprovision"),
    ]:
        encoded = "".join(os.environ.get(variable, "").split())
        require(bool(encoded), f"Missing GitHub secret {variable}.")
        data = base64.b64decode(encoded, validate=True)
        require(bool(data), f"Empty GitHub secret {variable}.")
        path = directory / filename
        path.write_bytes(data)
        path.chmod(0o600)
    require(bool(os.environ.get("IOS_DISTRIBUTION_P12_PASSWORD")),
            "Missing IOS_DISTRIBUTION_P12_PASSWORD.")


def profile():
    directory = signing_directory()
    result = subprocess.run(
        ["security", "cms", "-D", "-i", str(directory / "profile.mobileprovision")],
        check=True, capture_output=True,
    )
    decoded = plistlib.loads(result.stdout)
    identities = subprocess.run(
        ["security", "find-identity", "-v", "-p", "codesigning", str(directory / "release.keychain-db")],
        check=True, capture_output=True, text=True,
    ).stdout
    team, bundle = os.environ["APPLE_TEAM_ID"], os.environ["IOS_BUNDLE_ID"]
    profile_id, certificate = validate_profile(decoded, identities, team, bundle)
    options = {
        "method": "app-store-connect", "destination": "export", "teamID": team,
        "signingStyle": "manual", "signingCertificate": certificate,
        "provisioningProfiles": {bundle: profile_id}, "uploadSymbols": True,
        "manageAppVersionAndBuildNumber": False,
    }
    (directory / "ExportOptions.plist").write_bytes(plistlib.dumps(options))
    # Only validated UUID/hash values enter the runner environment, never profile contents.
    with open(os.environ["GITHUB_ENV"], "a", encoding="utf-8") as output:
        output.write(f"IOS_PROFILE_UUID={profile_id}\nIOS_SIGNING_SHA1={certificate}\n")


def upload_key():
    require(re.fullmatch(r"[A-Z0-9]{10}", os.environ.get("ASC_KEY_ID", "")), "Invalid ASC_KEY_ID.")
    uuid.UUID(os.environ.get("ASC_ISSUER_ID", ""))
    pem = os.environ.get("ASC_PRIVATE_KEY", "").strip()
    require(pem.startswith("-----BEGIN PRIVATE KEY-----") and pem.endswith("-----END PRIVATE KEY-----"),
            "ASC_PRIVATE_KEY must contain the downloaded Team API key PEM, not Base64.")
    directory = signing_directory() / "private_keys"
    directory.mkdir(mode=0o700)
    path = directory / f"AuthKey_{os.environ['ASC_KEY_ID']}.p8"
    path.write_text(pem + "\n", encoding="utf-8")
    path.chmod(0o600)
    subprocess.run(["openssl", "pkey", "-in", str(path), "-check", "-noout"],
                   check=True, capture_output=True)


def verify_app():
    app = Path(os.environ["SIGNED_APP_PATH"])
    metadata = plistlib.loads((app / "Info.plist").read_bytes())
    for field, expected in {
        "CFBundleIdentifier": os.environ["IOS_BUNDLE_ID"],
        "CFBundleShortVersionString": os.environ["APP_VERSION"],
        "CFBundleVersion": os.environ["APP_BUILD_NUMBER"],
    }.items():
        require(metadata.get(field) == expected, f"Signed application has unexpected {field}.")
    directory = signing_directory()
    embedded = subprocess.run(
        ["security", "cms", "-D", "-i", str(app / "embedded.mobileprovision")],
        check=True, capture_output=True,
    )
    decoded = plistlib.loads(embedded.stdout)
    identities = subprocess.run(
        ["security", "find-identity", "-v", "-p", "codesigning", str(directory / "release.keychain-db")],
        check=True, capture_output=True, text=True,
    ).stdout
    profile_id, certificate = validate_profile(decoded, identities, os.environ["APPLE_TEAM_ID"],
                                               os.environ["IOS_BUNDLE_ID"])
    require(profile_id == os.environ["IOS_PROFILE_UUID"]
            and certificate == os.environ["IOS_SIGNING_SHA1"],
            "Exported application uses a different provisioning profile or certificate.")
    entitlements = subprocess.run(
        ["codesign", "-d", "--entitlements", ":-", str(app)], check=True, capture_output=True,
    )
    signed_entitlements = plistlib.loads(entitlements.stdout)
    for name in ["application-identifier", "com.apple.developer.team-identifier", "get-task-allow"]:
        require(signed_entitlements.get(name) == decoded["Entitlements"].get(name),
                f"Signed application has unexpected {name} entitlement.")
    certificate_prefix = str(directory / "exported-certificate-")
    subprocess.run(["codesign", "-d", "--extract-certificates", certificate_prefix, str(app)],
                   check=True, capture_output=True)
    leaf = Path(certificate_prefix + "0").read_bytes()
    require(hashlib.sha1(leaf).hexdigest().upper() == certificate,
            "Application signature does not use the validated distribution certificate.")


if __name__ == "__main__":
    try:
        actions = {"inputs": lambda: validate_inputs(os.environ), "prepare": prepare,
                   "profile": profile, "upload-key": upload_key, "verify-app": verify_app}
        require(len(sys.argv) == 2 and sys.argv[1] in actions, "Unknown signing helper command.")
        actions[sys.argv[1]]()
    except (ValueError, KeyError, OSError, subprocess.CalledProcessError) as error:
        # Do not expose subprocess output: signing tools may include private file contents.
        message = str(error) if isinstance(error, ValueError) else "Signing helper failed; check the configured inputs and signing files."
        print(f"::error::{message}", file=sys.stderr)
        sys.exit(1)
