export class SpeechToTextService {
    private mediaRecorder: any = null; 
    private isEnabled = false;
    private onResultCallback?: (text: string) => void;
    private recordingInterval: any;

    constructor() {}

    public setCallback(callback: (text: string) => void): void {
        this.onResultCallback = callback;
    }

    public async start(): Promise<void> {
        if (this.isEnabled) return;
        this.isEnabled = true;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.setupRecorder(stream);
            console.log("STT Service: 本地语音采集已启动");
        } catch (error) {
            console.error("STT Service: 麦克风获取失败", error);
        }
    }

    private setupRecorder(stream: MediaStream): void {
        const recorderClass = (window as any).MediaRecorder;
        if (!recorderClass) {
            console.error("浏览器不支持 MediaRecorder");
            return;
        }

        this.mediaRecorder = new recorderClass(stream);
        
        this.mediaRecorder.ondataavailable = (event: any) => {
            if (event.data && event.data.size > 0) {
                this.sendAudioToBackend(event.data);
            }
        };

        this.mediaRecorder.start();
        this.recordingInterval = setInterval(() => {
            if (this.mediaRecorder && this.mediaRecorder.state === "recording") {
                this.mediaRecorder.stop();
                this.mediaRecorder.start();
            }
        }, 4000);
    }

    private async sendAudioToBackend(blob: Blob): Promise<void> {
        const formData = new FormData();
        formData.append("file", blob, "audio.webm");

        try {
            const response = await fetch("http://127.0.0.1:8001/transcribe", {
                method: "POST",
                body: formData
            });
            const data = await response.json();
            const text = data.text?.trim();
            
            if (text && this.onResultCallback) {
                this.onResultCallback(text);
            }
        } catch (error) {
            console.warn("STT Service: 后端通信失败，请确保 python stt_server.py 正在运行");
        }
    }

    public stop(): void {
        this.isEnabled = false;
        if (this.recordingInterval) {
            clearInterval(this.recordingInterval);
        }
        if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
            this.mediaRecorder.stop();
            this.mediaRecorder.stream.getTracks().forEach((track: any) => track.stop());
        }
        console.log("STT Service: 语音识别已停止");
    }
}