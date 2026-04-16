from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest import mock

REPO_ROOT = Path(__file__).resolve().parents[2]
HELPER_PATH = REPO_ROOT / "tools" / "generate_local_https_cert.py"

_spec = importlib.util.spec_from_file_location("generals_helper_generate_local_https_cert", HELPER_PATH)
assert _spec is not None and _spec.loader is not None
helper = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(helper)


class LocalHttpsCertHelperTest(unittest.TestCase):
    def test_reuses_existing_cert_pair(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cert_dir = Path(tmp)
            cert_path = cert_dir / "localhost.crt"
            key_path = cert_dir / "localhost.key"
            cert_path.write_text("existing-cert", encoding="utf-8")
            key_path.write_text("existing-key", encoding="utf-8")

            with mock.patch.object(helper, "cert_key_matches", return_value=True), \
                 mock.patch.object(helper, "build_certificate") as build_certificate:
                result_cert, result_key, generated = helper.ensure_cert_files(cert_dir, "localhost", ["localhost"], 825)

            self.assertFalse(generated)
            self.assertEqual(result_cert, cert_path)
            self.assertEqual(result_key, key_path)
            build_certificate.assert_not_called()
            self.assertEqual(cert_path.read_text(encoding="utf-8"), "existing-cert")
            self.assertEqual(key_path.read_text(encoding="utf-8"), "existing-key")

    def test_regenerates_when_one_file_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cert_dir = Path(tmp)
            cert_path = cert_dir / "localhost.crt"
            key_path = cert_dir / "localhost.key"
            cert_path.write_text("stale-cert", encoding="utf-8")

            with mock.patch.object(helper, "build_certificate", return_value=(b"new-cert", b"new-key")) as build_certificate:
                result_cert, result_key, generated = helper.ensure_cert_files(cert_dir, "localhost", ["localhost"], 825)

            self.assertTrue(generated)
            self.assertEqual(result_cert, cert_path)
            self.assertEqual(result_key, key_path)
            build_certificate.assert_called_once()
            self.assertEqual(cert_path.read_bytes(), b"new-cert")
            self.assertEqual(key_path.read_bytes(), b"new-key")

    def test_regenerates_when_pair_mismatches(self) -> None:
        cert_pem, _ = helper.build_certificate(["localhost"], 1)
        _, wrong_key_pem = helper.build_certificate(["localhost"], 1)

        with tempfile.TemporaryDirectory() as tmp:
            cert_dir = Path(tmp)
            cert_path = cert_dir / "localhost.crt"
            key_path = cert_dir / "localhost.key"
            cert_path.write_bytes(cert_pem)
            key_path.write_bytes(wrong_key_pem)

            with mock.patch.object(helper, "build_certificate", return_value=(b"fixed-cert", b"fixed-key")) as build_certificate:
                result_cert, result_key, generated = helper.ensure_cert_files(cert_dir, "localhost", ["localhost"], 825)

            self.assertTrue(generated)
            self.assertEqual(result_cert, cert_path)
            self.assertEqual(result_key, key_path)
            build_certificate.assert_called_once()
            self.assertEqual(cert_path.read_bytes(), b"fixed-cert")
            self.assertEqual(key_path.read_bytes(), b"fixed-key")

    def test_trust_invokes_certutil_on_windows(self) -> None:
        cert_pem, _ = helper.build_certificate(["localhost"], 1)

        with tempfile.TemporaryDirectory() as tmp:
            cert_path = Path(tmp) / "localhost.crt"
            cert_path.write_bytes(cert_pem)

            completed_store = mock.Mock(returncode=0, stdout="Cert Hash(sha1): 00 11 22 33\n", stderr="")
            completed_add = mock.Mock(returncode=0, stdout="", stderr="")
            with mock.patch.object(helper.platform, "system", return_value="Windows"), \
                 mock.patch.object(helper.subprocess, "run", side_effect=[completed_store, completed_add]) as run_mock:
                imported = helper.trust_certificate_windows(cert_path)

            self.assertTrue(imported)
            self.assertEqual(run_mock.call_count, 2)
            self.assertIn("-addstore", run_mock.call_args_list[1].args[0])

    def test_trust_skips_when_certificate_is_already_trusted(self) -> None:
        cert_pem, _ = helper.build_certificate(["localhost"], 1)

        with tempfile.TemporaryDirectory() as tmp:
            cert_path = Path(tmp) / "localhost.crt"
            cert_path.write_bytes(cert_pem)
            thumbprint = helper.certificate_sha1_thumbprint(cert_path)

            completed_store = mock.Mock(returncode=0, stdout=f"Cert Hash(sha1): {thumbprint[:8]} {thumbprint[8:]}\n", stderr="")
            with mock.patch.object(helper.platform, "system", return_value="Windows"), \
                 mock.patch.object(helper.subprocess, "run", return_value=completed_store) as run_mock:
                imported = helper.trust_certificate_windows(cert_path)

            self.assertFalse(imported)
            run_mock.assert_called_once()



if __name__ == "__main__":
    unittest.main()






