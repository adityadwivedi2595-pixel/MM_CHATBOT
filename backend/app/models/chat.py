from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime

class ChatMessage(BaseModel):
    role: str = Field(..., description="Role of the sender: 'user', 'assistant', or 'system'")
    content: str = Field(..., description="Text content of the message")
    timestamp: Optional[str] = Field(default_factory=lambda: datetime.utcnow().isoformat())
    metadata: Optional[Dict[str, Any]] = None

class SourceCitation(BaseModel):
    title: str
    url: str
    snippet: str

class ChatRequest(BaseModel):
    message: str = Field(..., description="The user's query or prompt")
    history: Optional[List[ChatMessage]] = Field(default_factory=list, description="Recent conversation history")
    document_id: Optional[str] = Field(None, description="Optional active document ID for RAG or editing")
    image_data: Optional[str] = Field(None, description="Optional base64 image or data URI")
    image_mime_type: Optional[str] = Field("image/jpeg", description="MIME type for image")
    stream: bool = Field(False, description="Whether to stream the response (SSE)")
    voice_response: bool = Field(False, description="Whether to generate TTS audio response")

class ChatResponse(BaseModel):
    message: str = Field(..., description="AI generated response text")
    sources: List[SourceCitation] = Field(default_factory=list, description="Source citations from search or documents")
    attachments: List[Dict[str, Any]] = Field(default_factory=list, description="Any attached media or links")
    audio_url: Optional[str] = Field(None, description="URL for spoken TTS audio if requested")
    generated_file: Optional[Dict[str, Any]] = Field(None, description="Metadata of generated/modified document if applicable")
    intent: str = Field("chat", description="Classified intent: 'chat', 'rag', 'search', 'doc_edit', 'emotional_support'")
