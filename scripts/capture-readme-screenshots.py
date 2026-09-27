#!/usr/bin/env python3
"""Capture README images from the real UI at a 2x pixel scale."""

import os
import shutil
import signal
import struct
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
URL = "http://127.0.0.1:5179/scripts/readme-preview.html"
SIZE = (1800, 1400)


def stop(process: subprocess.Popen[bytes]) -> None:
    if process.poll() is not None:
        return
    if os.name == "posix":
        os.killpg(process.pid, signal.SIGTERM)
    else:
        process.terminate()
    process.wait(timeout=5)


def wait_for_preview(process: subprocess.Popen[bytes]) -> None:
    for _ in range(100):
        if process.poll() is not None:
            raise RuntimeError("Vite exited before the preview was ready")
        try:
            with urllib.request.urlopen(URL, timeout=0.2) as response:
                if response.status == 200:
                    return
        except (OSError, TimeoutError):
            time.sleep(0.1)
    raise RuntimeError("Vite preview did not become ready")


def png_size(path: Path) -> tuple[int, int] | None:
    if not path.exists():
        return None
    with path.open("rb") as image:
        header = image.read(24)
    if len(header) < 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", header[16:24])


def capture(chrome: str, url: str, output: Path, profile: Path) -> None:
    command = [
        chrome,
        "--headless=new",
        "--disable-gpu",
        "--disable-background-networking",
        "--no-first-run",
        "--hide-scrollbars",
        "--force-device-scale-factor=2",
        "--window-size=900,700",
        "--virtual-time-budget=3000",
        f"--user-data-dir={profile}",
        f"--screenshot={output}",
        url,
    ]
    process = subprocess.Popen(
        command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True
    )
    try:
        for _ in range(200):
            if png_size(output) == SIZE and output.stat().st_size > 10_000:
                return
            if process.poll() is not None:
                raise RuntimeError(f"Chrome exited before capturing {output.name}")
            time.sleep(0.1)
        raise RuntimeError(f"Chrome did not capture {output.name}")
    finally:
        stop(process)


def main() -> None:
    chrome = os.environ.get("CHROME_BIN") or shutil.which("google-chrome") or shutil.which("chromium")
    if not chrome:
        mac_chrome = Path("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome")
        if mac_chrome.is_file():
            chrome = str(mac_chrome)
    if not chrome:
        raise RuntimeError("Set CHROME_BIN to a Chrome or Chromium executable")

    vite = subprocess.Popen(
        ["npm", "run", "dev", "--", "--host", "127.0.0.1", "--port", "5179", "--strictPort"],
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    try:
        wait_for_preview(vite)
        with tempfile.TemporaryDirectory(prefix="pipeup-readme-") as temp:
            directory = Path(temp)
            captures = [
                (URL, "app-main-light.png"),
                (URL + "?page=settings", "app-settings.png"),
            ]
            for index, (url, name) in enumerate(captures):
                capture(chrome, url, directory / name, directory / f"chrome-{index}")
            for _, name in captures:
                source = directory / name
                target = ROOT / "docs" / "images" / name
                shutil.copyfile(source, target)
                print(f"{target}: {SIZE[0]}x{SIZE[1]}")
    finally:
        stop(vite)


if __name__ == "__main__":
    main()
