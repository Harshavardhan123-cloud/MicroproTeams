"""
MicroproTeams — AI Service
Pluggable AI provider system: local Whisper + LangChain for meeting intelligence.
Supports on-prem (default) and cloud (OpenAI / Gemini) providers.
"""

from __future__ import annotations

import abc
import asyncio
import json
import logging
import os
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# ── Data Models ──────────────────────────────────────────────────────────────

@dataclass
class Transcript:
    text: str
    segments: List[Dict[str, Any]] = field(default_factory=list)
    language: str = "en"
    duration_seconds: float = 0.0


@dataclass
class Speaker:
    id: str
    label: str
    segments: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class MeetingNotes:
    summary: str
    key_decisions: List[str] = field(default_factory=list)
    action_items: List[Dict[str, Any]] = field(default_factory=list)   # {owner, task, due_date}
    open_questions: List[str] = field(default_factory=list)
    topic_timeline: List[Dict[str, Any]] = field(default_factory=list)  # {timestamp, topic}
    sentiment_analysis: Dict[str, Any] = field(default_factory=dict)
    participants: List[str] = field(default_factory=list)


@dataclass
class EmbeddingResult:
    text: str
    vector: List[float]
    model: str


# ── Abstract Provider ─────────────────────────────────────────────────────────

class AIProvider(abc.ABC):
    """Base contract for all AI providers. Switch providers via config."""

    @abc.abstractmethod
    async def transcribe(self, audio_bytes: bytes, language: str = "en") -> Transcript:
        """Convert audio bytes to text transcript with timestamps."""

    @abc.abstractmethod
    async def summarize(self, text: str, max_words: int = 500) -> str:
        """Summarize a block of text."""

    @abc.abstractmethod
    async def embed(self, text: str) -> List[float]:
        """Return semantic embedding vector for text."""

    @abc.abstractmethod
    async def generate_meeting_notes(self, transcript: Transcript) -> MeetingNotes:
        """Run the full meeting intelligence pipeline on a transcript."""

    @abc.abstractmethod
    async def chat(self, messages: List[Dict[str, str]], context: str = "") -> str:
        """Chat completion for the AI co-pilot."""


# ── Local Whisper Provider (default, on-prem) ─────────────────────────────────

class WhisperLocalProvider(AIProvider):
    """
    Uses OpenAI's Whisper running locally via the `openai-whisper` package.
    Models: tiny, base, small, medium, large-v3 (trade speed vs accuracy).
    Default: base — good accuracy, fast on CPU.
    """

    MODEL_NAME = os.getenv("WHISPER_MODEL", "base")
    _model = None  # Lazy-loaded singleton

    def _load_model(self):
        if WhisperLocalProvider._model is None:
            try:
                import whisper  # type: ignore
                model_path = os.getenv("WHISPER_MODEL_PATH", None)
                logger.info(f"Loading Whisper model '{self.MODEL_NAME}'…")
                WhisperLocalProvider._model = whisper.load_model(self.MODEL_NAME, download_root=model_path)
                logger.info("Whisper model loaded.")
            except ImportError:
                raise RuntimeError(
                    "openai-whisper not installed. Run: pip install openai-whisper"
                )
        return WhisperLocalProvider._model

    async def transcribe(self, audio_bytes: bytes, language: str = "en") -> Transcript:
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self._transcribe_sync, audio_bytes, language)

    def _transcribe_sync(self, audio_bytes: bytes, language: str) -> Transcript:
        import numpy as np  # type: ignore

        model = self._load_model()
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name
        try:
            result = model.transcribe(tmp_path, language=language, word_timestamps=True)
            segments = [
                {
                    "start": seg["start"],
                    "end": seg["end"],
                    "text": seg["text"].strip(),
                }
                for seg in result.get("segments", [])
            ]
            duration = segments[-1]["end"] if segments else 0.0
            return Transcript(
                text=result["text"],
                segments=segments,
                language=result.get("language", language),
                duration_seconds=duration,
            )
        finally:
            os.unlink(tmp_path)

    async def summarize(self, text: str, max_words: int = 500) -> str:
        """Stub: uses simple extractive summarization without external API."""
        # Extractive fallback — first N sentences as summary placeholder
        sentences = text.replace("\n", " ").split(". ")
        limit = max(1, max_words // 15)
        return ". ".join(sentences[:limit]) + "."

    async def embed(self, text: str) -> List[float]:
        """
        Local embedding using sentence-transformers.
        Falls back to a zero vector stub if not installed.
        """
        try:
            from sentence_transformers import SentenceTransformer  # type: ignore
            model = SentenceTransformer("all-MiniLM-L6-v2")
            loop = asyncio.get_event_loop()
            vector = await loop.run_in_executor(None, lambda: model.encode(text).tolist())
            return vector
        except ImportError:
            logger.warning("sentence-transformers not installed — returning zero vector stub.")
            return [0.0] * 384

    async def generate_meeting_notes(self, transcript: Transcript) -> MeetingNotes:
        """
        Run LangChain multi-agent pipeline for full meeting intelligence.
        Falls back to a structured stub if langchain is not configured.
        """
        try:
            return await self._langchain_notes(transcript)
        except Exception as e:
            logger.warning(f"LangChain notes failed ({e}), returning stub notes.")
            return self._stub_notes(transcript)

    async def _langchain_notes(self, transcript: Transcript) -> MeetingNotes:
        from langchain_core.prompts import ChatPromptTemplate  # type: ignore
        from langchain_core.output_parsers import JsonOutputParser  # type: ignore
        from langchain_openai import ChatOpenAI  # type: ignore

        llm = ChatOpenAI(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            api_key=os.getenv("OPENAI_API_KEY", ""),
            temperature=0.2,
        )

        # Agent 1 — Summary
        summary_chain = (
            ChatPromptTemplate.from_template(
                "Summarize this meeting transcript in {max_words} words or less:\n\n{transcript}"
            )
            | llm
        )

        # Agent 2 — Structured extraction (decisions, actions, questions)
        extract_prompt = ChatPromptTemplate.from_template(
            """Analyze this meeting transcript and return a JSON object with keys:
            - key_decisions: list of strings
            - action_items: list of {{owner, task, due_date}} objects
            - open_questions: list of strings
            - topic_timeline: list of {{timestamp, topic}} objects
            - sentiment_analysis: {{overall, per_speaker: {{name: sentiment}}}}

            Transcript:
            {transcript}

            Return only valid JSON."""
        )
        extract_chain = extract_prompt | llm | JsonOutputParser()

        summary_task = summary_chain.ainvoke({"transcript": transcript.text, "max_words": 500})
        extract_task = extract_chain.ainvoke({"transcript": transcript.text})

        summary_result, extract_result = await asyncio.gather(summary_task, extract_task)

        return MeetingNotes(
            summary=summary_result.content if hasattr(summary_result, "content") else str(summary_result),
            key_decisions=extract_result.get("key_decisions", []),
            action_items=extract_result.get("action_items", []),
            open_questions=extract_result.get("open_questions", []),
            topic_timeline=extract_result.get("topic_timeline", []),
            sentiment_analysis=extract_result.get("sentiment_analysis", {}),
        )

    def _stub_notes(self, transcript: Transcript) -> MeetingNotes:
        """Lightweight stub when LLM is unavailable — returns parseable structure."""
        words = transcript.text.split()
        summary = " ".join(words[:80]) + "…" if len(words) > 80 else transcript.text
        return MeetingNotes(
            summary=summary,
            key_decisions=["[AI analysis pending — LLM not configured]"],
            action_items=[],
            open_questions=[],
            topic_timeline=[{"timestamp": 0, "topic": "Meeting start"}],
            sentiment_analysis={"overall": "neutral"},
        )

    async def chat(self, messages: List[Dict[str, str]], context: str = "") -> str:
        """Simple context-aware chat using LangChain or stub."""
        try:
            from langchain_openai import ChatOpenAI  # type: ignore
            llm = ChatOpenAI(
                model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
                api_key=os.getenv("OPENAI_API_KEY", ""),
                temperature=0.3,
            )
            system_msg = (
                f"You are the MicroproTeams AI co-pilot. "
                f"Help users with their meeting and channel questions.\n\nContext:\n{context}"
                if context
                else "You are the MicroproTeams AI co-pilot."
            )
            full_messages = [{"role": "system", "content": system_msg}] + messages
            response = await llm.ainvoke(full_messages)
            return response.content
        except Exception as e:
            logger.warning(f"Chat LLM unavailable ({e}), returning stub.")
            return "AI co-pilot is not configured. Please set OPENAI_API_KEY in your .env file."


# ── Cloud Providers (OpenAI / Gemini) ─────────────────────────────────────────

class OpenAIProvider(AIProvider):
    """Uses OpenAI Whisper API for transcription + GPT for intelligence."""

    def __init__(self):
        try:
            import openai  # type: ignore
            self.client = openai.AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY", ""))
        except ImportError:
            raise RuntimeError("openai package not installed.")

    async def transcribe(self, audio_bytes: bytes, language: str = "en") -> Transcript:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            f.write(audio_bytes)
            tmp_path = f.name
        try:
            with open(tmp_path, "rb") as audio_file:
                result = await self.client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language=language,
                    response_format="verbose_json",
                    timestamp_granularities=["segment"],
                )
            segments = [
                {"start": s.start, "end": s.end, "text": s.text}
                for s in (result.segments or [])
            ]
            return Transcript(
                text=result.text,
                segments=segments,
                language=result.language or language,
                duration_seconds=result.duration or 0.0,
            )
        finally:
            os.unlink(tmp_path)

    async def summarize(self, text: str, max_words: int = 500) -> str:
        response = await self.client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[
                {"role": "system", "content": "Summarize the following text concisely."},
                {"role": "user", "content": text},
            ],
            max_tokens=max_words * 2,
        )
        return response.choices[0].message.content or ""

    async def embed(self, text: str) -> List[float]:
        response = await self.client.embeddings.create(
            model="text-embedding-3-small",
            input=text,
        )
        return response.data[0].embedding

    async def generate_meeting_notes(self, transcript: Transcript) -> MeetingNotes:
        whisper_provider = WhisperLocalProvider()
        # Reuse the LangChain pipeline — just needs the transcript
        return await whisper_provider._langchain_notes(transcript)

    async def chat(self, messages: List[Dict[str, str]], context: str = "") -> str:
        system = f"You are the MicroproTeams AI co-pilot.\n\nContext:\n{context}" if context else "You are the MicroproTeams AI co-pilot."
        response = await self.client.chat.completions.create(
            model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
            messages=[{"role": "system", "content": system}] + messages,
            temperature=0.3,
        )
        return response.choices[0].message.content or ""


class GeminiProvider(AIProvider):
    """Uses Google Gemini for AI intelligence (transcription falls back to local Whisper)."""

    def __init__(self):
        try:
            import google.generativeai as genai  # type: ignore
            genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
            self._genai = genai
            self._model = genai.GenerativeModel(os.getenv("GEMINI_MODEL", "gemini-1.5-flash"))
        except ImportError:
            raise RuntimeError("google-generativeai package not installed.")

    async def transcribe(self, audio_bytes: bytes, language: str = "en") -> Transcript:
        # Gemini doesn't have a dedicated transcription API — fall back to local Whisper
        return await WhisperLocalProvider().transcribe(audio_bytes, language)

    async def summarize(self, text: str, max_words: int = 500) -> str:
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: self._model.generate_content(f"Summarize this in {max_words} words:\n\n{text}"),
        )
        return response.text

    async def embed(self, text: str) -> List[float]:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            lambda: self._genai.embed_content(model="models/text-embedding-004", content=text),
        )
        return result["embedding"]

    async def generate_meeting_notes(self, transcript: Transcript) -> MeetingNotes:
        prompt = f"""Analyze this meeting transcript and return ONLY a JSON object with these keys:
- summary (string, ~500 words)
- key_decisions (list of strings)
- action_items (list of {{owner, task, due_date}})
- open_questions (list of strings)
- topic_timeline (list of {{timestamp, topic}})
- sentiment_analysis ({{overall, per_speaker}})

Transcript:
{transcript.text}"""
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: self._model.generate_content(prompt))
        try:
            raw = response.text.strip().lstrip("```json").rstrip("```").strip()
            data = json.loads(raw)
        except Exception:
            data = {}
        return MeetingNotes(
            summary=data.get("summary", transcript.text[:500]),
            key_decisions=data.get("key_decisions", []),
            action_items=data.get("action_items", []),
            open_questions=data.get("open_questions", []),
            topic_timeline=data.get("topic_timeline", []),
            sentiment_analysis=data.get("sentiment_analysis", {}),
        )

    async def chat(self, messages: List[Dict[str, str]], context: str = "") -> str:
        history = "\n".join(f"{m['role'].upper()}: {m['content']}" for m in messages)
        prompt = f"Context:\n{context}\n\n{history}" if context else history
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: self._model.generate_content(prompt))
        return response.text


# ── Provider Factory ─────────────────────────────────────────────────────────

_PROVIDERS = {
    "whisper_local": WhisperLocalProvider,
    "openai": OpenAIProvider,
    "gemini": GeminiProvider,
}

_instance: Optional[AIProvider] = None


def get_ai_provider() -> AIProvider:
    """
    Returns singleton AI provider based on AI_PROVIDER env var.
    Defaults to 'whisper_local' (fully on-prem, no API cost).
    """
    global _instance
    if _instance is None:
        provider_name = os.getenv("AI_PROVIDER", "whisper_local").lower()
        provider_cls = _PROVIDERS.get(provider_name, WhisperLocalProvider)
        logger.info(f"Initializing AI provider: {provider_name}")
        _instance = provider_cls()
    return _instance


# ── Streaming Transcription (for live captions) ───────────────────────────────

class StreamingTranscriber:
    """
    Chunks audio in 5-second windows and feeds them to Whisper for
    near-real-time captions. Used during active meeting calls.
    """

    CHUNK_DURATION_S = 5
    SAMPLE_RATE = 16000
    BYTES_PER_SAMPLE = 2  # int16

    def __init__(self, language: str = "en"):
        self.language = language
        self._buffer = b""
        self._provider = WhisperLocalProvider()
        self._chunk_size = self.CHUNK_DURATION_S * self.SAMPLE_RATE * self.BYTES_PER_SAMPLE

    async def feed(self, audio_chunk: bytes) -> Optional[str]:
        """Feed raw PCM audio bytes. Returns caption text when a chunk is ready."""
        self._buffer += audio_chunk
        if len(self._buffer) >= self._chunk_size:
            chunk, self._buffer = self._buffer[: self._chunk_size], self._buffer[self._chunk_size :]
            transcript = await self._provider.transcribe(chunk, self.language)
            return transcript.text.strip() or None
        return None

    def flush(self) -> bytes:
        """Return remaining buffered audio and clear."""
        remaining = self._buffer
        self._buffer = b""
        return remaining
