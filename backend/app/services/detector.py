import math
import re
from collections import Counter


def sentences(text):
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+", text.strip()) if s.strip()]


def words(text):
    return re.findall(r"\b[\w'-]+\b", text.lower())


def sentence_stats(text):
    ss = sentences(text)
    lengths = [len(words(s)) for s in ss]
    if not lengths:
        return 0.0, 0.0

    mean = sum(lengths) / len(lengths)
    variance = sum((x - mean) ** 2 for x in lengths) / len(lengths)
    return mean, math.sqrt(variance)


def lexical_diversity(text):
    ws = words(text)
    return len(set(ws)) / len(ws) if ws else 0.0


def repetition_score(text):
    ws = words(text)
    if len(ws) < 10:
        return 0.0
    counts = Counter(ws)
    repeated = sum(max(0, n - 2) for n in counts.values())
    return min(1.0, repeated / max(1, len(ws) * 0.15))


def burstiness(text):
    ss = sentences(text)
    lengths = [len(words(s)) for s in ss]
    if len(lengths) < 2:
        return 0.0
    mean = sum(lengths) / len(lengths)
    if mean == 0:
        return 0.0
    sd = (sum((x - mean) ** 2 for x in lengths) / len(lengths)) ** 0.5
    return min(1.0, sd / mean)


def analyze_text(text):
    ws = words(text)
    if len(ws) < 80:
        return {
            "score": None,
            "confidence": "low",
            "reason": "Text is too short for a reliable AI-likelihood estimate.",
            "features": {
                "word_count": len(ws),
                "lexical_diversity": lexical_diversity(text),
                "burstiness": burstiness(text),
                "repetition": repetition_score(text),
            },
        }

    mean_len, sd_len = sentence_stats(text)
    diversity = lexical_diversity(text)
    burst = burstiness(text)
    repetition = repetition_score(text)

    # Heuristic score only. Higher uniformity/repetition and lower diversity
    # contribute to an AI-like signal. This is not authorship proof.
    uniformity = 1.0 - min(1.0, sd_len / max(mean_len, 1.0) / 0.8)
    score = (
        0.45 * uniformity
        + 0.30 * (1.0 - min(1.0, diversity * 1.4))
        + 0.25 * repetition
    )
    score = round(max(0.0, min(1.0, score)) * 100)

    confidence = "high" if len(ws) >= 500 else "medium"

    return {
        "score": score,
        "confidence": confidence,
        "reason": "Estimate based on sentence uniformity, lexical diversity, and repetition signals.",
        "features": {
            "word_count": len(ws),
            "mean_sentence_words": round(mean_len, 2),
            "sentence_length_sd": round(sd_len, 2),
            "lexical_diversity": round(diversity, 4),
            "burstiness": round(burst, 4),
            "repetition": round(repetition, 4),
        },
    }
