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


if __name__ == "__main__":
    unittest.main()
