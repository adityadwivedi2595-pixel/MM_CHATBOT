"""
MM CHATBOT — Standalone Python Multimodal CLI Tool
Use Google Gemini 2.0 directly in Python for vision, text, and audio.

Usage Examples:
    python multimodal_cli.py --prompt "Hello! Introduce yourself."
    python multimodal_cli.py --image "screenshot.png" --prompt "What is shown in this image?"
    python multimodal_cli.py --interactive
"""

import os
import sys
import argparse
from pathlib import Path
from dotenv import load_dotenv

# Ensure UTF-8 output on Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

load_dotenv()

try:
    from google import genai
    from google.genai import types
except ImportError:
    print("Error: 'google-genai' library not installed.")
    print("Run: pip install -r requirements.txt")
    sys.exit(1)


def get_client(api_key: str = None) -> genai.Client:
    key = (api_key or os.getenv("GEMINI_API_KEY", "")).strip()
    if not key:
        print("\n⚠️  No GEMINI_API_KEY found!")
        print("Please set your key in .env or pass it with --api-key YOUR_KEY")
        print("Get your free key at: https://aistudio.google.com/app/apikey\n")
        key = input("Enter your Gemini API Key now (or press Enter to exit): ").strip()
        if not key:
            sys.exit(1)
    return genai.Client(api_key=key)


def normalize_model(model: str) -> str:
    deprecated_map = {
        "gemini-2.0-flash": "gemini-3.5-flash",
        "gemini-2.5-flash": "gemini-3.5-flash",
        "gemini-1.5-flash": "gemini-3.5-flash",
        "gemini-1.5-pro": "gemini-3.1-pro-preview",
        "gemini-2.0-pro": "gemini-3.1-pro-preview",
        "gemini-2.5-pro": "gemini-3.1-pro-preview",
        "gemini-2.5-flash-lite": "gemini-3.5-flash-lite"
    }
    return deprecated_map.get(model, model)


def run_query(client: genai.Client, prompt: str, image_path: str = None, model: str = "gemini-3.5-flash"):
    model = normalize_model(model)
    parts = []

    if image_path:
        p = Path(image_path)
        if not p.exists():
            print(f"Error: Image file '{image_path}' not found.")
            return

        with open(p, "rb") as f:
            data = f.read()

        suffix = p.suffix.lower()
        mime_map = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
            ".pdf": "application/pdf"
        }
        mime = mime_map.get(suffix, "image/jpeg")
        parts.append(types.Part.from_bytes(data=data, mime_type=mime))
        print(f"📎 Attached file: {p.name} ({mime})")

    parts.append(types.Part.from_text(text=prompt))

    print(f"\n🤖 MM Chatbot ({model}): ", end="", flush=True)

    try:
        response_stream = client.models.generate_content_stream(
            model=model,
            contents=[types.Content(role="user", parts=parts)]
        )
        for chunk in response_stream:
            if chunk.text:
                print(chunk.text, end="", flush=True)
        print("\n")
    except Exception as e:
        print(f"\nError from Gemini API: {e}\n")


def interactive_mode(client: genai.Client, model: str = "gemini-3.5-flash"):
    model = normalize_model(model)
    print("=" * 60)
    print(f"🌌 MM CHATBOT Interactive Python Shell ({model})")
    print("Type your message and press Enter. Type 'exit' to quit.")
    print("To attach an image, type: /image path/to/image.png [your question]")
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
                img_path = parts[1]
                query = parts[2] if len(parts) > 2 else "Analyze this image in detail."
                run_query(client, prompt=query, image_path=img_path, model=model)
            else:
                run_query(client, prompt=user_input, model=model)

        except (KeyboardInterrupt, EOFError):
            print("\nExiting session.")
            break


def main():
    parser = argparse.ArgumentParser(description="MM CHATBOT Python CLI")
    parser.add_argument("--prompt", "-p", type=str, help="Text prompt to send")
    parser.add_argument("--image", "-i", type=str, help="Path to image or document file")
    parser.add_argument("--model", "-m", type=str, default="gemini-3.5-flash", help="Gemini model name")
    parser.add_argument("--api-key", "-k", type=str, help="Gemini API Key")
    parser.add_argument("--interactive", action="store_true", help="Launch interactive chat session")

    args = parser.parse_args()

    client = get_client(args.api_key)

    if args.interactive or not args.prompt:
        interactive_mode(client, model=args.model)
    else:
        run_query(client, prompt=args.prompt, image_path=args.image, model=args.model)


if __name__ == "__main__":
    main()
