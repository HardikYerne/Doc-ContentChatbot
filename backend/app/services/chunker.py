from langchain_text_splitters import RecursiveCharacterTextSplitter


splitter = RecursiveCharacterTextSplitter(
    chunk_size=1800,
    chunk_overlap=250,
    separators=["\n\n", "\n", ". ", " ", ""],
)


def chunk_pages(pages):
    output = []
    for page in pages:
        for idx, chunk in enumerate(splitter.split_text(page["text"])):
            if chunk.strip():
                output.append({
                    "page": page["page"],
                    "text": chunk.strip(),
                    "chunk_index": idx,
                })
    return output
