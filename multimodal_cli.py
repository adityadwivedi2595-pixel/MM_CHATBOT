"""Zenith Assistant standalone multimodal CLI using Gemini's streaming API."""

import os
import sys
import argparse
import base64
import json
import mimetypes
from pathlib import Path

import requests
from dotenv import load_dotenv

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

load_dotenv()


def get_api_key(api_key: str = None) -> str:
    key = (api_key or os.getenv("GEMINI_API_KEY", "")).strip()
    if not key:
        print("\nNo GEMINI_API_KEY found. Set it in .env or pass --api-key YOUR_KEY.")
        print("Create one at https://aistudio.google.com/app/apikey\n")
        key = input("Enter your Gemini API key (or press Enter to exit): ").strip()
    if not key:
        sys.exit(1)
    return key


def run_query(api_key: str, prompt: str, image_path: str = None, model: str = "gemini-3.6-flash"):
    parts = [{"text": prompt}]
    if image_path:
        path = Path(image_path)
        if not path.exists():
            print(f"Error: File '{image_path}' not found.")
            return
        mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        parts.insert(0, {"inline_data": {"mime_type": mime_type, "data": base64.b64encode(path.read_bytes()).decode("ascii")}})
        print(f"Attached file: {path.name} ({mime_type})")

    print(f"\nZenith Assistant ({model}): ", end="", flush=True)
    try:
        with requests.post(
            f"https://generativelanguage.googleapis.com/v1beta/models/{model}:streamGenerateContent?alt=sse",
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            json={"contents": [{"role": "user", "parts": parts}]}, stream=True, timeout=(20, 180),
        ) as response:
            if not response.ok:
                try:
                    detail = response.json().get("error", {}).get("message", f"HTTP {response.status_code}")
                except Exception:
                    detail = f"HTTP {response.status_code}"
                print(f"\nGemini API error: {detail}\n")
                return
            for line in response.iter_lines(decode_unicode=True):
                if not line or not line.startswith("data:"):
                    continue
                try:
                    event = json.loads(line[5:].strip())
                except json.JSONDecodeError:
                    continue
                for chunk in event.get("candidates", [{}])[0].get("content", {}).get("parts", []):
                    if chunk.get("text"):
                        print(chunk["text"], end="", flush=True)
        print("\n")
    except requests.RequestException as exc:
        print(f"\nGemini request failed: {exc}\n")


def interactive_mode(api_key: str, model: str = "gemini-3.6-flash"):
    print("=" * 60)
    print(f"ZENITH ASSISTANT Interactive Shell ({model})")
    print("Type your message and press Enter. Type 'exit' to quit.")
    print("To attach an image or document, type: /image path/to/file [your question]")
    print("=" * 60)
    while True:
        try:
            user_input = input("\nYou > ").strip()
            if not user_input:
                continue
            if user_input.lower() in ("exit", "quit", "q"):
                print("Goodbye!")
                break
            if user_input.startswith("/image "):
                parts = user_input.split(" ", 2)
                run_query(api_key, parts[2] if len(parts) > 2 else "Analyze this file.", parts[1], model)
            else:
                run_query(api_key, user_input, model=model)
        except (KeyboardInterrupt, EOFError):
            print("\nExiting session.")
            break


def main():
    parser = argparse.ArgumentParser(description="ZENITH ASSISTANT Python CLI")
    parser.add_argument("--prompt", "-p", type=str, help="Text prompt to send")
    parser.add_argument("--image", "-i", type=str, help="Path to an image or document file")
    parser.add_argument("--model", "-m", type=str, default="gemini-3.6-flash", help="Gemini model name")
    parser.add_argument("--api-key", "-k", type=str, help="Gemini API key")
    parser.add_argument("--interactive", action="store_true", help="Launch interactive chat session")
    args = parser.parse_args()
    api_key = get_api_key(args.api_key)
    if args.interactive or not args.prompt:
        interactive_mode(api_key, args.model)
    else:
        run_query(api_key, args.prompt, args.image, args.model)


if __name__ == "__main__":
    main()
