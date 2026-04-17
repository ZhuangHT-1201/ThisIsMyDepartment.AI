import os
os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
import tempfile
import asyncio  
from pathlib import Path
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import uvicorn

SCRIPT_DIR = Path(__file__).resolve().parent
MODEL_DIR = SCRIPT_DIR / "models" / "tiny"

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8000", "http://127.0.0.1:8000"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_CONCURRENT_TRANSCRIBES = 2
transcribe_semaphore = asyncio.Semaphore(MAX_CONCURRENT_TRANSCRIBES)

print("正在从本地文件夹加载语音识别模型...")
model = WhisperModel("small", device="cpu", compute_type="int8")
print("模型加载完毕，随时准备接收语音")

def run_transcription(file_path):
    return model.transcribe(
        file_path, 
        language="zh", 
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(threshold=0.7, min_silence_duration_ms=500),
        initial_prompt="这是一段普通话会议对话，包含标点符号。", 
        condition_on_previous_text=False
    )

@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    fd, temp_file_path = tempfile.mkstemp(suffix=".webm")
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(await file.read())
        async with transcribe_semaphore:
            segments, info = await asyncio.to_thread(run_transcription, temp_file_path)
            
        valid_segments = [s.text for s in segments if s.no_speech_prob < 0.6]
        text = "".join(valid_segments).strip()
        
        if text:
            print(f"最终有效识别: {text}")
        return {"text": text}    
    except Exception as e:
        print(f"识别出错: {e}")
        return {"text": ""}
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)

if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.getenv("TIMD_STT_PORT", "8001")))