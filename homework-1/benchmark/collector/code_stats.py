"""Lines of code produced by a variant (vendor, build and generated files excluded)."""
import os

SKIP_DIRS = {"node_modules", "dist", "build", ".browsers", ".npm-cache", "test-results", "playwright-report",
             "coverage", ".git", "debate", "__pycache__", ".venv", ".vite"}
SKIP_FILES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml"}
CODE_EXT = {".js", ".jsx", ".mjs", ".cjs", ".ts", ".tsx", ".py", ".css", ".html", ".sh", ".json"}


def _is_test(path: str) -> bool:
    parts = path.replace("\\", "/").split("/")
    name = parts[-1]
    return any(p in ("test", "tests", "e2e", "__tests__") for p in parts) or ".test." in name or ".spec." in name or name.startswith("test_")


def code_stats(root: str) -> dict:
    loc = files = 0
    has_tests = False
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for name in filenames:
            if name in SKIP_FILES or os.path.splitext(name)[1] not in CODE_EXT:
                continue
            path = os.path.join(dirpath, name)
            with open(path, encoding="utf-8", errors="ignore") as fh:
                loc += sum(1 for line in fh if line.strip())
            files += 1
            has_tests = has_tests or _is_test(os.path.relpath(path, root))
    return {"loc": loc, "files": files, "has_tests": has_tests}
