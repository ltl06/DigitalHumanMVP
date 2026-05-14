"""TTS engine module."""
from .engine import (
    configure,
    generate_custom_voice,
    generate_voice_clone,
    generate_voice_design,
    load_model,
    unload_model as tts_unload,
    adjust_audio_params,
)
