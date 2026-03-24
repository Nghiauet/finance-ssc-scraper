import re

import tiktoken


def count_tokens(text: str, model: str = "cl100k_base") -> int:
    """Count tokens using tiktoken."""
    try:
        enc = tiktoken.get_encoding(model)
    except Exception:
        enc = tiktoken.get_encoding("cl100k_base")
    return len(enc.encode(text))


def chunk_markdown(
    content: str,
    max_tokens: int = 800,
    overlap_tokens: int = 100,
) -> list[dict]:
    """Split markdown content into semantic chunks.

    Strategy:
    1. Split by headings (##, ###) as section boundaries
    2. Keep tables intact (never split inside a table)
    3. Split large sections at paragraph boundaries
    4. Add overlap between chunks

    Returns list of dicts: {text, heading, index}
    """
    sections = _split_by_headings(content)
    chunks = []

    for heading, section_text in sections:
        section_tokens = count_tokens(section_text)

        if section_tokens <= max_tokens:
            chunks.append({
                "text": section_text.strip(),
                "heading": heading,
            })
        else:
            # Split large section into smaller chunks at paragraph boundaries
            sub_chunks = _split_section(section_text, max_tokens, overlap_tokens)
            for sc in sub_chunks:
                chunks.append({
                    "text": sc.strip(),
                    "heading": heading,
                })

    # Add indices and token counts
    result = []
    for i, chunk in enumerate(chunks):
        if not chunk["text"]:
            continue
        result.append({
            "text": chunk["text"],
            "heading": chunk["heading"],
            "index": i,
            "token_count": count_tokens(chunk["text"]),
        })

    return result


def _split_by_headings(content: str) -> list[tuple[str | None, str]]:
    """Split markdown by heading boundaries."""
    # Match markdown headings (##, ###, etc.)
    heading_pattern = re.compile(r"^(#{1,4})\s+(.+)$", re.MULTILINE)

    sections: list[tuple[str | None, str]] = []
    last_pos = 0
    last_heading = None

    for match in heading_pattern.finditer(content):
        # Text before this heading belongs to the previous section
        text_before = content[last_pos:match.start()]
        if text_before.strip():
            sections.append((last_heading, text_before))

        last_heading = match.group(2).strip()
        last_pos = match.end()

    # Remaining text after last heading
    remaining = content[last_pos:]
    if remaining.strip():
        sections.append((last_heading, remaining))

    # If no headings found, return the whole content as one section
    if not sections:
        sections.append((None, content))

    return sections


def _split_section(text: str, max_tokens: int, overlap_tokens: int) -> list[str]:
    """Split a large section into chunks at paragraph or table boundaries."""
    # First, identify table blocks to keep them intact
    blocks = _split_preserving_tables(text)

    chunks = []
    current_chunk = ""
    current_tokens = 0

    for block in blocks:
        block_tokens = count_tokens(block)

        if current_tokens + block_tokens <= max_tokens:
            current_chunk += block + "\n\n"
            current_tokens += block_tokens
        else:
            if current_chunk:
                chunks.append(current_chunk)
            # If a single block exceeds max_tokens, include it anyway
            if block_tokens > max_tokens:
                chunks.append(block)
                current_chunk = ""
                current_tokens = 0
            else:
                # Start new chunk with overlap from previous
                overlap_text = _get_overlap(current_chunk, overlap_tokens)
                current_chunk = overlap_text + block + "\n\n"
                current_tokens = count_tokens(current_chunk)

    if current_chunk.strip():
        chunks.append(current_chunk)

    return chunks


def _split_preserving_tables(text: str) -> list[str]:
    """Split text into blocks, keeping markdown tables intact."""
    lines = text.split("\n")
    blocks = []
    current_block: list[str] = []
    in_table = False

    for line in lines:
        is_table_line = line.strip().startswith("|") or re.match(r"^\s*\|[-:| ]+\|\s*$", line)

        if is_table_line:
            if not in_table and current_block:
                blocks.append("\n".join(current_block))
                current_block = []
            in_table = True
            current_block.append(line)
        else:
            if in_table:
                # End of table
                blocks.append("\n".join(current_block))
                current_block = []
                in_table = False

            if line.strip() == "" and current_block:
                blocks.append("\n".join(current_block))
                current_block = []
            elif line.strip():
                current_block.append(line)

    if current_block:
        blocks.append("\n".join(current_block))

    return [b for b in blocks if b.strip()]


def _get_overlap(text: str, overlap_tokens: int) -> str:
    """Get the last `overlap_tokens` tokens worth of text."""
    try:
        enc = tiktoken.get_encoding("cl100k_base")
        tokens = enc.encode(text)
        if len(tokens) <= overlap_tokens:
            return text
        overlap = enc.decode(tokens[-overlap_tokens:])
        return overlap + "\n\n"
    except Exception:
        # Fallback: take last ~400 chars
        return text[-400:] + "\n\n" if len(text) > 400 else text
