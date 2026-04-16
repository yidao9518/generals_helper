from __future__ import annotations

from pathlib import Path
import re

ROOT = Path(r"D:\code\generals_helper\src\display\assets\patterns")
SVG_FILES = sorted(ROOT.glob("*.svg"))


def clean_svg(text: str) -> str:
    text = text.lstrip("\ufeff")
    text = text.replace("\r\n", "\n")
    text = re.sub(r"^\s*<\?xml[^>]*\?>\s*", "", text)
    text = re.sub(r"<!--.*?-->\s*", "", text, flags=re.S)
    text = re.sub(r"<metadata\b.*?</metadata>\s*", "", text, flags=re.S)
    text = re.sub(r"<sodipodi:namedview\b.*?</sodipodi:namedview>\s*", "", text, flags=re.S)
    text = re.sub(r"<sodipodi:namedview\b[^>]*/>\s*", "", text, flags=re.S)
    text = re.sub(r"\s(?:inkscape|sodipodi):[A-Za-z0-9_.-]+=\"[^\"]*\"", "", text)
    text = re.sub(r"\sxmlns:(?:inkscape|sodipodi|rdf|cc|dc|svg)=\"[^\"]*\"", "", text)
    text = re.sub(r"\sstandalone=\"[^\"]*\"", "", text)
    text = re.sub(r"\sxml:space=\"[^\"]*\"", "", text)
    text = re.sub(r"\s*<inkscape:path-effect\b[^>]*/>\s*", "\n", text)
    text = re.sub(r"(<svg\b[^>]*)\s+version=\"[^\"]*\"", r"\1", text, flags=re.S)
    text = re.sub(r"(<svg\b[^>]*)\s+id=\"[^\"]*\"", r"\1", text, flags=re.S)
    text = re.sub(r"(<svg\b[^>]*)\s+xmlns:svg=\"[^\"]*\"", r"\1", text, flags=re.S)
    text = re.sub(r"(<defs\b[^>]*)\s+id=\"[^\"]*\"", r"\1", text, flags=re.S)
    text = re.sub(r"<defs\b([^>]*)>\s*</defs>", r"<defs\1 />", text, flags=re.S)
    text = re.sub(r"\n\s*<defs\b[^>]*/>\s*", "\n", text)
    if "xlink:" not in text:
        text = re.sub(r"\sxmlns:xlink=\"[^\"]*\"", "", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip() + "\n"
    return text


def main() -> None:
    for path in SVG_FILES:
        original = path.read_text(encoding="utf-8-sig")
        cleaned = clean_svg(original)
        if cleaned != original:
            path.write_text(cleaned, encoding="utf-8")
            print(f"cleaned {path.name}")
        else:
            print(f"unchanged {path.name}")


if __name__ == "__main__":
    main()





