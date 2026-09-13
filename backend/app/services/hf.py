import httpx
from app.config import settings


async def hf_request(model: str, payload: dict):
    url = f"https://router.huggingface.co/hf-inference/models/{model}"
    headers = {"Authorization": f"Bearer {settings.hf_token}"}

    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(url, headers=headers, json=payload)

    if response.status_code >= 400:
        raise RuntimeError(f"Hugging Face error {response.status_code}: {response.text[:500]}")
    return response.json()


async def embed_texts(texts: list[str]):
    result = await hf_request(
        settings.hf_embedding_model,
        {"inputs": texts, "options": {"wait_for_model": True}},
    )
    return normalize_embeddings(result)


def normalize_embeddings(result):
    # Some HF inference responses return one vector for one input and
    # a list of vectors for multiple inputs.
    if not isinstance(result, list):
        raise RuntimeError("Unexpected embedding response.")

    if result and isinstance(result[0], (int, float)):
        return [result]

    # Sentence-transformer inference may return token-level vectors.
    vectors = []
    for item in result:
        if item and isinstance(item[0], list):
            # mean-pool token embeddings
            dim = len(item[0])
            mean = [0.0] * dim
            for token in item:
                for i, value in enumerate(token):
                    mean[i] += float(value)
            n = len(item)
            vectors.append([x / n for x in mean])
        else:
            vectors.append([float(x) for x in item])
    return vectors


async def generate(prompt: str):
    result = await hf_request(
        settings.hf_llm_model,
        {
            "inputs": prompt,
            "parameters": {
                "max_new_tokens": 700,
                "temperature": 0.2,
                "return_full_text": False,
            },
            "options": {"wait_for_model": True},
        },
    )

    if isinstance(result, list) and result:
        item = result[0]
        if isinstance(item, dict):
            return item.get("generated_text", "")
        return str(item)

    if isinstance(result, dict):
        return result.get("generated_text", "")

    return str(result)
