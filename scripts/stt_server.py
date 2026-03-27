import os
import tempfile
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from faster_whisper import WhisperModel
import uvicorn
app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
print("正在从本地文件夹加载轻量级语音识别模型...")
model = WhisperModel("./models/tiny", device="cpu", compute_type="int8")
print("模型加载完毕，随时准备接收语音！")
@app.post("/transcribe")
async def transcribe_audio(file: UploadFile = File(...)):
    fd, temp_file_path = tempfile.mkstemp(suffix=".webm")
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(await file.read())
        segments, info = model.transcribe(temp_file_path, language="zh", beam_size=5)
        text = "".join([segment.text for segment in segments]).strip()
        if text:
            print(f"识别到语音: {text}")
        return {"text": text}    
    except Exception as e:
        print(f"识别出错: {e}")
        return {"text": ""}
    finally:
        if os.path.exists(temp_file_path):
            os.remove(temp_file_path)
if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=8001)