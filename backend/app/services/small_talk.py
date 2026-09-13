"""
Lightweight small-talk / greeting detector.

Purpose: catch casual conversational messages ("hi", "thanks", "who are
you?", ...) BEFORE they reach the document RAG pipeline, so the chatbot
replies naturally instead of forcing a "grounded in document context"
answer to a message that isn't actually a question about the document.

This module is intentionally standalone and has no dependency on Mongo,
the vector store, or the LLM client — it's a pure text -> Optional[str]
lookup, called once at the top of `chat_with_document` in rag.py.
"""

import re

_GREETING_PATTERNS = [
    r"h+e?l+o+",        # hello, hii, hellooo
    r"h+i+",            # hi, hii, hiii
    r"h+e+y+",          # hey, heyy
    r"yo+",
    r"sup",
    r"what'?s up",
    r"howdy",
]

_GOOD_MORNING = r"good\s*morning"
_GOOD_AFTERNOON = r"good\s*afternoon"
_GOOD_EVENING = r"good\s*evening"
_GOOD_NIGHT = r"good\s*night"

_THANKS_PATTERNS = [
    r"thanks?( you)?( so much| a lot| a ton)?",
    r"thank\s*you( so much| a lot| a ton)?",
    r"thx",
    r"ty",
    r"appreciate it",
    r"much appreciated",
]

_OKAY_PATTERNS = [
    r"ok(ay)?",
    r"alright",
    r"got it",
    r"cool",
    r"sure",
    r"k",
    r"noted",
    r"fine",
]

_BYE_PATTERNS = [
    r"bye+",
    r"goodbye",
    r"good\s*bye",
    r"see (you|ya)( later| soon)?",
    r"cya",
    r"take care",
    r"catch you later",
]

_WHO_ARE_YOU = [
    r"who are you",
    r"what are you",
    r"what'?s your name",
    r"introduce yourself",
]

_WHAT_CAN_YOU_DO = [
    r"what can you do",
    r"what do you do",
    r"how (can|do) you help( me)?",
    r"help$",
    r"help me$",
    r"what (are your|features)",
]

_REPLIES = {
    "good_morning": "Good morning! ☀️ How can I help you with your document today?",
    "good_afternoon": "Good afternoon! 😊 How can I help you with your document today?",
    "good_evening": "Good evening! 🌆 How can I help you with your document today?",
    "good_night": "Good night! 🌙 I'll be right here whenever you're ready to continue.",
    "greeting": "Hello! 👋 How can I help you with your document today?",
    "thanks": "You're welcome! 😊 Anything else you'd like to know about the document?",
    "bye": "Goodbye! 👋 Come back anytime you want to work on this document.",
    "who_are_you": (
        "I'm QuantumMines AI — your document intelligence assistant. "
        "Upload a document and I can summarize it, analyze it, rewrite parts "
        "of it, and answer questions grounded in its content."
    ),
    "what_can_you_do": (
        "I can analyze, summarize, discuss, and rewrite your document, generate "
        "content from it, draft emails, extract structured information, build "
        "quizzes and mind maps, and more — all grounded in the document you upload."
    ),
    "okay": "👍 Let me know what you'd like to do next.",
}


def _normalize(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"[!?.,~]+$", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def _fullmatches(text: str, patterns: list[str]) -> bool:
    return any(re.fullmatch(p, text) for p in patterns)


def detect_small_talk(message: str) -> str | None:
    """
    Returns a canned reply for casual/small-talk messages, or None if the
    message looks like a real question that should go through the RAG
    pipeline as usual.
    """
    text = _normalize(message)
    if not text:
        return None

    # Order matters: check the more specific "good ___" greetings before
    # the generic greeting patterns.
    if re.fullmatch(_GOOD_MORNING, text):
        return _REPLIES["good_morning"]
    if re.fullmatch(_GOOD_AFTERNOON, text):
        return _REPLIES["good_afternoon"]
    if re.fullmatch(_GOOD_EVENING, text):
        return _REPLIES["good_evening"]
    if re.fullmatch(_GOOD_NIGHT, text):
        return _REPLIES["good_night"]

    if _fullmatches(text, _GREETING_PATTERNS):
        return _REPLIES["greeting"]

    if _fullmatches(text, _THANKS_PATTERNS):
        return _REPLIES["thanks"]

    if _fullmatches(text, _BYE_PATTERNS):
        return _REPLIES["bye"]

    if _fullmatches(text, _WHO_ARE_YOU):
        return _REPLIES["who_are_you"]

    if _fullmatches(text, _WHAT_CAN_YOU_DO):
        return _REPLIES["what_can_you_do"]

    if _fullmatches(text, _OKAY_PATTERNS):
        return _REPLIES["okay"]

    return None
