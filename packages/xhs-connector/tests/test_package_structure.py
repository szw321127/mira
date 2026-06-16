import json
import re
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


class PackageStructureTest(unittest.TestCase):
    def test_package_scripts_are_cross_platform(self):
        package_json = json.loads((ROOT / "package.json").read_text())
        unix_env_assignment = re.compile(r"(^|&&\\s+)[A-Z][A-Z0-9_]*=")

        offenders = [
            script
            for script in package_json.get("scripts", {}).values()
            if unix_env_assignment.search(script)
        ]

        self.assertEqual(offenders, [])
        self.assertIn("scripts/run-python.mjs", (ROOT / "package.json").read_text())

    def test_python_runner_bootstraps_local_virtualenv(self):
        runner = (ROOT / "scripts" / "run-python.mjs").read_text()

        self.assertIn(".venv", runner)
        self.assertIn("requirements.txt", runner)
        self.assertIn("pip", runner)

    def test_dev_scripts_pass_uvicorn_port_flag(self):
        package_json = json.loads((ROOT / "package.json").read_text())

        self.assertIn(
            "--port --port-env XHS_CONNECTOR_PORT --default-port 8800",
            package_json["scripts"]["dev"],
        )
        self.assertIn(
            "--port --port-env XHS_CONNECTOR_PORT --default-port 8800",
            package_json["scripts"]["start"],
        )


if __name__ == "__main__":
    unittest.main()
