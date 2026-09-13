import httpx

from huggingface_hub import AsyncInferenceClient

from app.config import settings


async def hf_request(model: str, payload: dict):
    url = f"https://router.huggingface.co/hf-inference/models/{model}"
    headers = {
        "Authorization": f"Bearer {settings.hf_token}"
    }

    async with httpx.AsyncClient(timeout=90) as client:
        response = await client.post(
            url,
            headers=headers,
            json=payload,
        )

    if response.status_code >= 400:
        raise RuntimeError(
            f"Hugging Face error {response.status_code}: "
            f"{response.text[:500]}"
        )

    return response.json()


async def embed_texts(texts: list[str]):
    """
    Generate embeddings using Hugging Face's feature-extraction task.

    sentence-transformers/all-MiniLM-L6-v2 produces
    384-dimensional sentence embeddings.
    """

    client = AsyncInferenceClient(
        provider="hf-inference",
        api_key=settings.hf_token,
    )

    result = await client.feature_extraction(
        texts,
        model=settings.hf_embedding_model,
    )

    if hasattr(result, "tolist"):
        result = result.tolist()

    if result and isinstance(result[0], (int, float)):
        result = [result]

    vectors = []

    for vector in result:
        vectors.append([float(x) for x in vector])

    return vectors


async def generate(prompt: str):
    client = AsyncInferenceClient(
        provider="auto",
        api_key=settings.hf_token,
    )

    result = await client.chat_completion(
        model=settings.hf_llm_model,
        messages=[
            {
                "role": "user",
                "content": prompt,
            }
        ],
        max_tokens=700,
        temperature=0.2,
    )

    return result.choices[0].message.content