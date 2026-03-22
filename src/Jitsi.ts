import { UserVideoElement } from "./customElements/UserVideoElement";
import { isDev } from "./engine/util/env";
import { sleep } from "./engine/util/time";
import { AudioMixerEffect as MusicSource } from "./JitsiMixer";
import { ThisIsMyDepartmentApp } from "./main/ThisIsMyDepartmentApp";
import { DEFAULT_DEV_ROOM_NAME, DEFAULT_SHARED_ROOM_NAME, getStoredMediaDevicePreference, setStoredMediaDevicePreference } from "./main/constants";
import { getJitsiConnectionOptions } from "./main/runtimeConfig";
import { CharacterNode } from "./main/nodes/CharacterNode";
import { IFrameNode } from "./main/nodes/IFrameNode";
import JitsiConference from "./typings/Jitsi/JitsiConference";
import { JitsiConferenceErrors } from "./typings/Jitsi/JitsiConferenceErrors";
import { JitsiConferenceEvents } from "./typings/Jitsi/JitsiConferenceEvents";
import JitsiConnection, { JitsiConferenceInitOptions, JitsiConferenceOptions } from "./typings/Jitsi/JitsiConnection";
import { JitsiConnectionEvents } from "./typings/Jitsi/JitsiConnectionEvents";
import { JitsiMeetJSType } from "./typings/Jitsi/JitsiMeetJS";
import { JitsiTrackEvents } from "./typings/Jitsi/JitsiTrackEvents";
import JitsiLocalTrack from "./typings/Jitsi/modules/RTC/JitsiLocalTrack";
import JitsiRemoteTrack from "./typings/Jitsi/modules/RTC/JitsiRemoteTrack";

export default class JitsiInstance {

    // Get the jitsi object from window (:D)
    public JitsiMeetJS = (window as any)["JitsiMeetJS"] as JitsiMeetJSType;

    public connection: JitsiConnection | null = null;
    public isJoined = false;
    public room!: JitsiConference;

    public localTracks: Array<JitsiLocalTrack> = [];
    public remoteTracks: Record<string, Array<JitsiRemoteTrack>> = {};
    private audioEnabled = false;
    private videoEnabled = false;
    private localTrackCreationPromise?: Promise<void>;

    private connectionOptions: JitsiConferenceOptions = {
        ...getJitsiConnectionOptions()
    };

    private confOptions: JitsiConferenceInitOptions = {
        openBridgeChannel: true,
        p2p: {
            enabled: false
        }
    };


    public async create(): Promise<JitsiConference> {
        return new Promise((resolve, reject) => {

            this.JitsiMeetJS.setLogLevel(this.JitsiMeetJS.logLevels.ERROR);

            window.addEventListener("beforeunload", this.unload.bind(this));
            window.addEventListener("unload", this.unload.bind(this));

            // JitsiMeetJS.setLogLevel(JitsiMeetJS.logLevels.ERROR);
            const initOptions = {
                disableAudioLevels: true
            };

            this.JitsiMeetJS.init(initOptions);

            this.connection = new this.JitsiMeetJS.JitsiConnection(undefined, undefined, this.connectionOptions);

            this.connection.addEventListener(
                JitsiConnectionEvents.CONNECTION_ESTABLISHED,
                () => this.onConnectionSuccess(resolve));
            this.connection.addEventListener(
                JitsiConnectionEvents.CONNECTION_FAILED,
                this.onConnectionFailed.bind(this));
            this.connection.addEventListener(
                JitsiConnectionEvents.CONNECTION_DISCONNECTED,
                this.disconnect.bind(this));

            this.connection?.connect(undefined);

            const audioOutputDevice = getStoredMediaDevicePreference(localStorage, "audioOutput");

            if (audioOutputDevice != null) {
                this.changeAudioOutput(audioOutputDevice);
            }
        });
    }

    /**
     * Handles local tracks.
     * @param tracks Array with JitsiTrack objects
     */
    private async onLocalTracks(tracks: Array<JitsiLocalTrack> | JitsiConferenceErrors) {
        if (!(tracks instanceof Array)) {
            return;
        }
        this.localTracks = tracks;
        for (let i = 0; i < this.localTracks.length; i++) {
            if (this.localTracks[i].getType() === "video") {
                const localVideo = (document.getElementById("localUserVideo") as UserVideoElement ?? await this.createLocalVideoElement());
                if (localVideo) {
                    localVideo.setTrack(this.localTracks[i]);
                }
                if (this.isJoined) {
                    if (this.room.getLocalVideoTrack() != null) {
                        this.room.replaceTrack(this.room.getLocalVideoTrack()!, this.localTracks[i]);
                    } else {
                        this.room.addTrack(this.localTracks[i]);
                    }
                }
            } else {
                const localAudio = document.getElementById("localAudio") ?? this.createLocalAudio();
                if (localAudio) {
                    this.localTracks[i].attach(localAudio);
                }
                if (this.isJoined) {
                    if (this.room.getLocalAudioTrack() != null) {
                        this.room.replaceTrack(this.room.getLocalAudioTrack()!, this.localTracks[i]);
                    } else {
                        this.room.addTrack(this.localTracks[i]);
                    }
                }
            }
        }
        this.applyLocalMediaPreferences();
    }

    private createLocalAudio(): HTMLAudioElement {
        const audioEl = document.createElement("audio");
        audioEl.muted = true;
        audioEl.autoplay = true;
        audioEl.id = "localAudio";
        document.body.append(audioEl);
        return audioEl;
    }

    private async createLocalVideoElement(): Promise<UserVideoElement> {
        const existing = document.getElementById("localUserVideo") as UserVideoElement | null;
        if (existing) {
            return existing;
        }
        await sleep(50);
        const videoElement = new UserVideoElement("You", this.room, undefined, true);
        document.getElementById("videos")?.append(videoElement);
        return videoElement;
    }

    private onRemoteTrackRemoved(track: JitsiRemoteTrack): void {
        if (track.isLocal()) {
            return;
        }

        const participant = track.getParticipantId();

        const indexOfTrackToRemove = this.remoteTracks[participant].indexOf(track);
        if (indexOfTrackToRemove !== -1) {
            this.remoteTracks[participant].splice(indexOfTrackToRemove, 1);
        }

        if (track.getType() === "video") {
            this.removeVideoTrackForUser(participant);
        } else {
            const element = document.getElementById(`${participant}audio`);
            element?.remove();
        }
    }

    /**
     * Handles remote tracks
     * @param track JitsiTrack object
     */
    private onRemoteTrack(track: JitsiRemoteTrack): void {
        if (track.isLocal()) {
            return;
        }
        const participant = track.getParticipantId();

        if (track.getOriginalStream().getAudioTracks().length > 1) {
            track.getOriginalStream().getAudioTracks().forEach(t => {
                console.log(t);
                if (document.getElementById(`${participant}audio`) == null) {
                    const element = document.createElement("audio");
                    element.autoplay = true;
                    element.id = `${participant}audio`;
                    document.body.append(element);
                    const stream = new MediaStream([t]);
                    element.srcObject = stream;
                    element.muted = true;
                } else {
                    const stream = new MediaStream([t]);
                    (document.getElementById(`${participant}audio`) as HTMLAudioElement).srcObject = stream;
                }
                const videoElement = document.getElementById(`${participant}video`) as UserVideoElement;
                videoElement?.connectAudioSource(track.getOriginalStream());
            });
        } else if (track.getOriginalStream().getAudioTracks().length === 1) {
            if (document.getElementById(`${participant}audio`) == null) {
                const element = document.createElement("audio");
                element.autoplay = true;
                element.id = `${participant}audio`;
                document.body.append(element);
                element.srcObject = track.getOriginalStream();
                setTimeout(() => {
                    const videoElement = document.getElementById(`${participant}video`) as UserVideoElement;
                    videoElement?.connectAudioSource(track.getOriginalStream());
                }, 1000);
            }
        }

        track.addEventListener(JitsiTrackEvents.NO_DATA_FROM_SOURCE, (val) => {
            const indexOfTrackToRemove = this.remoteTracks[participant].indexOf(track);
            if (indexOfTrackToRemove !== -1) {
                this.remoteTracks[participant].splice(indexOfTrackToRemove, 1);
                const element = document.getElementById(`${participant}${track.getType()}`);
                if (element?.parentElement?.classList.contains("userVideo")) {
                    element.parentElement.remove();
                } else {
                    element?.remove();
                }
            }
        });

        track.getOriginalStream().onremovetrack = (ev) => {
            console.log(ev);
            if (ev.track) {
                console.log(document.getElementById(`${participant + ev.track.id}audio`));
                document.getElementById(`${participant + ev.track.id}audio`)?.remove();
            }
        };

        if (!this.remoteTracks[participant]) {
            this.remoteTracks[participant] = [];
        }

        this.remoteTracks[participant].push(track);


        track.addEventListener(
            JitsiTrackEvents.TRACK_AUDIO_LEVEL_CHANGED,
            (audioLevel: number) => {
                console.log(`Audio Level remote: ${audioLevel}`);
            });
        track.addEventListener(
            JitsiTrackEvents.TRACK_VIDEOTYPE_CHANGED,
            (ev: "desktop" | "camera") => {
                console.log("Other videotype", ev);
            });
        track.addEventListener(
            JitsiTrackEvents.NO_DATA_FROM_SOURCE,
            (ev) => {
                console.log("NO DATA");
            });
        track.addEventListener(
            JitsiTrackEvents.LOCAL_TRACK_STOPPED,
            () => {
                console.log("remote track stopped");
            });

        if (track.getType() === "video") {
            const wrapper = this.createVideoTrackForUser(track);
            document.getElementById("videos")?.append(wrapper);
        }
    }

    /**
     * That function is executed when the conference is joined
     */
    private onConferenceJoined(): void {
        this.isJoined = true;
        for (let i = 0; i < this.localTracks.length; i++) {
            this.room.addTrack(this.localTracks[i]);
        }
        this.applyLocalMediaPreferences();
    }

    /**
     *
     * @param id
     */
    private onUserLeft(id: string): void {
        if (!this.remoteTracks[id]) {
            return;
        }
        ThisIsMyDepartmentApp.instance.removePlayer(id);
        const tracks = this.remoteTracks[id];

        for (let i = 0; i < tracks.length; i++) {
            if (tracks[i].isVideoTrack()) {
                this.removeVideoTrackForUser(tracks[i].getParticipantId());
            } else if (tracks[i].isAudioTrack()) {
                const elementId = `${id}${tracks[i].getType()}`;
                const element = document.getElementById(elementId);
                if (element == null) {
                    continue;
                }
                element.remove();
                tracks[i].detach(element);
            }
        }
    }

    /**
     * That function is called when connection is established successfully
     */
    private onConnectionSuccess(resolve: (value: JitsiConference | PromiseLike<JitsiConference>) => void): void {
        if (this.connection == null) {
            return;
        }
        this.room = this.connection.initJitsiConference(isDev() ? DEFAULT_DEV_ROOM_NAME : DEFAULT_SHARED_ROOM_NAME, this.confOptions);
        this.room.setReceiverConstraints({
            defaultConstraints: { maxHeight: 1080 }
        });
        (window as any)["room"] = this.room;
        this.room.on(JitsiConferenceEvents.TRACK_ADDED, this.onRemoteTrack.bind(this));
        this.room.on(JitsiConferenceEvents.TRACK_REMOVED, this.onRemoteTrackRemoved.bind(this));
        this.room.on(JitsiConferenceEvents.CONFERENCE_JOINED, this.onConferenceJoined.bind(this));
        this.room.on(JitsiConferenceEvents.USER_JOINED, async id => {
            this.remoteTracks[id] = [];
            await sleep(500);
            if (ThisIsMyDepartmentApp.instance.isInGameScene() && id !== this.room.getName()) {
                ThisIsMyDepartmentApp.instance.showNotification(this.room.getParticipantById(id).getDisplayName() + " joined");
            }
        });
        this.room.on(JitsiConferenceEvents.MESSAGE_RECEIVED, this.handleMessageReceived.bind(this));
        this.room.on(JitsiConferenceEvents.PRIVATE_MESSAGE_RECEIVED, this.handleMessageReceived.bind(this));
        this.room.on(JitsiConferenceEvents.USER_LEFT, this.onUserLeft.bind(this));
        this.room.on(JitsiConferenceEvents.TRACK_MUTE_CHANGED, (track: JitsiRemoteTrack) => {
            if (track.isLocal()) {
                return;
            }
            if (track.isVideoTrack() && track.isMuted()) {
                this.pauseVideoTrackForUser(track.getParticipantId());
            } else if (track.isVideoTrack()) {
                this.resumeVideoTrackForUser(track);
            }
        });
        this.room.on(
            JitsiConferenceEvents.DISPLAY_NAME_CHANGED,
            (userID: string, displayName: string) => {
                const parent = document.getElementById(`${userID}video`) as UserVideoElement;
                const textElement = parent?.nameSpan;
                if (textElement) {
                    textElement.innerText = displayName;
                }
            });
        this.room.addCommandListener("presentationUpdate", (values: any) => {
            const parsedObj = JSON.parse(values.value);
            if (parsedObj.id !== this.room.myUserId()) {
                ThisIsMyDepartmentApp.instance.handleOtherPlayerPresentationUpdate(parsedObj);
            }
        });
        this.room.addCommandListener("speakerUpdate", (values: any) => {
            const parsedObj = JSON.parse(values.value);
            if (parsedObj.id !== this.room.myUserId()) {
                const id = this.room.getParticipantById(parsedObj.id).getDisplayName();
                const character = ThisIsMyDepartmentApp.instance.getGameScene().rootNode.getDescendantById(id) as CharacterNode;
                character?.activateSpeakerNode({userId: parsedObj.id, nodeId: parsedObj.speakerNode, id: parsedObj.shareAudioId});
                if (parsedObj.id != null) {
                    ThisIsMyDepartmentApp.instance.showNotification(id + " started to share music");
                } else {
                    ThisIsMyDepartmentApp.instance.showNotification(id + " stopped to share music");
                }
            }
        });
        this.room.addCommandListener("IFrameUpdate", (values: any) => {
            const parsedObj = JSON.parse(values.value);
            if (parsedObj.id !== this.room.myUserId()) {
                const iFrameToUpdate = ThisIsMyDepartmentApp.instance.getGameScene().rootNode.getDescendantsByType<IFrameNode>(IFrameNode)
                    .filter(iFrame => iFrame.url === parsedObj.originalUrl);
                ThisIsMyDepartmentApp.instance.showNotification(this.room.getParticipantById(parsedObj.id).getDisplayName() + " started a game");
                iFrameToUpdate.forEach(iFrame => {
                    iFrame.url = parsedObj.newUrl;
                    iFrame.pasteInput?.remove();
                    if (iFrame.isOpen()) {
                        iFrame.close();
                        iFrame.open();
                    }
                });
            }
        });
        this.room.on(
            JitsiConferenceEvents.TRACK_AUDIO_LEVEL_CHANGED,
            (userID: string, audioLevel: number) => {
                console.log(`${userID} - ${audioLevel}`);
            });
        this.room.join();
        resolve(this.room);
    }

    private handleMessageReceived(participantId: string, text: string, ts: number): void {
        const isSelf = participantId === this.room.myUserId();
        const displayName = isSelf
            ? ThisIsMyDepartmentApp.instance.userName
            : this.room.getParticipantById(participantId)?.getDisplayName() ?? "anonymous";

        ThisIsMyDepartmentApp.instance.handleParticipantChat(participantId, displayName, text, isSelf);

        if (isSelf && ThisIsMyDepartmentApp.instance.isInGameScene()) {
            ThisIsMyDepartmentApp.instance.getPlayer()?.say(text, 5);
            return;
        }
        const player = ThisIsMyDepartmentApp.instance.getOtherPlayerById(participantId);
        player?.say(text, 5);
    }

    private createVideoTrackForUser(track: JitsiRemoteTrack | JitsiLocalTrack): UserVideoElement {
        const nameOfParticipant = this.room.getParticipantById(track.getParticipantId())?.getDisplayName() ?? "anonymous";
        const videoElement = new UserVideoElement(nameOfParticipant, undefined, track.getParticipantId());
        videoElement.id = `${track.getParticipantId()}video`;
        videoElement.setTrack(track);
        return videoElement;
    }

    private removeVideoTrackForUser(userID: string): void {
        const vidEl = document.getElementById(`${userID}video`) as UserVideoElement;
        vidEl?.remove();
    }

    public pauseVideoTrackForUser(userID: string): void {
        const videoElement = document.getElementById(`${userID}video`) as UserVideoElement | null;
        if (videoElement == null) {
            return;
        }
        videoElement.setVideoEnabled(false);
    }

    public resumeVideoTrackForUser(track: JitsiRemoteTrack | JitsiLocalTrack): void {
        const videoElement = document.getElementById(`${track.getParticipantId()}video`) as UserVideoElement | null;
        if (videoElement != null) {
            videoElement.setTrack(track);
            videoElement.setVideoEnabled(true);
        }
    }

    /**
     * This function is called when the connection fail.
     */
    private onConnectionFailed(): void {
        console.error("Connection Failed!");
    }

    /**
     * This function is called when we disconnect.
     */
    private disconnect(): void {
        if (this.connection == null) {
            return;
        }
        console.log("disconnect!");
        this.connection.removeEventListener(
            JitsiConnectionEvents.CONNECTION_ESTABLISHED,
            this.onConnectionSuccess.bind(this));
        this.connection.removeEventListener(
            JitsiConnectionEvents.CONNECTION_FAILED,
            this.onConnectionFailed.bind(this));
        this.connection.removeEventListener(
            JitsiConnectionEvents.CONNECTION_DISCONNECTED,
            this.disconnect.bind(this));
    }

    /**
     *
     */
    private async unload(): Promise<void> {
        for (let i = 0; i < this.localTracks.length; i++) {
            this.localTracks[i].dispose();
        }
        if (this.room) {
            await this.room.leave();
        }
        this.connection?.disconnect();
    }

    public async shareTabAudio(): Promise<string> {
        return new Promise((resolve, reject) => {
            const audioMixer = this.JitsiMeetJS.createAudioMixer();
            const localStream = this.room.getLocalAudioTrack()?.getOriginalStream();
            if (localStream != null) {
                audioMixer.addMediaStream(localStream);
            }
            this.JitsiMeetJS.createLocalTracks({
                devices: ["desktop"],
            }).then(async (tracks: Array<JitsiLocalTrack> | JitsiConferenceErrors) => {
                if (tracks instanceof Array) {
                    const filteredTracks = tracks.filter(t => t.isLocalAudioTrack());
                    if (filteredTracks.length === 0) {
                        window.alert("You should have ticked the 'share audio' box");
                        return;
                    }
                    const newAudioTrack = filteredTracks[0];
                    const localAudioTrack = this.room.getLocalAudioTrack();
                    audioMixer.addMediaStream(newAudioTrack.getOriginalStream());
                    if (localAudioTrack) {
                        if (newAudioTrack != null) {
                            const stream = newAudioTrack.getOriginalStream();
                            newAudioTrack.addEventListener(JitsiTrackEvents.LOCAL_TRACK_STOPPED, async () => {
                                localAudioTrack.getOriginalStream().removeTrack(stream.getAudioTracks()[0]);
                                await localAudioTrack.setEffect(undefined);
                            });
                            console.log(new MusicSource(stream));
                            await newAudioTrack.setEffect(new MusicSource(localAudioTrack.getOriginalStream()));
                            console.log(localAudioTrack);
                            console.log(stream.getAudioTracks()[0].id);
                            console.log(localAudioTrack.getOriginalStream().getAudioTracks().map(l => l.id));
                            resolve(stream.getAudioTracks()[0].id);
                        }
                        this.room.replaceTrack(localAudioTrack, newAudioTrack);
                    }
                }
                reject("NO_DATA");
            }).catch(err => reject(err));
        });
    }

    public switchVideo(): void {
        if (!this.room) {
            ThisIsMyDepartmentApp.instance.showNotification("Video controls are not ready yet.");
            return;
        }

        if (!this.JitsiMeetJS.isDesktopSharingEnabled()) {
            ThisIsMyDepartmentApp.instance.showNotification("Screen sharing is not supported in this browser or context.");
            return;
        }

        // TODO if presentation try to redirect pc audio
        const previousTrack = this.room.getLocalVideoTrack();
        if (previousTrack != null) {
            this.localTracks.splice(this.localTracks.indexOf(previousTrack), 1);
        }
        const isScreenShareActive = !!this.room.getLocalVideoTrack()?.isScreenSharing();
        ThisIsMyDepartmentApp.instance.showNotification(isScreenShareActive ? "Switching back to camera..." : "Starting screen share...");

        this.JitsiMeetJS.createLocalTracks({
            devices: [isScreenShareActive ? "video" : "desktop"]
        }).then(tracks => {
            if (tracks instanceof Array) {
                const element = document.getElementById("localUserVideo") as UserVideoElement;
                const nextVideoTrack = tracks.find(track => track.getType() === "video");
                if (!nextVideoTrack) {
                    ThisIsMyDepartmentApp.instance.showNotification("No video track was created for screen sharing.");
                    return;
                }

                this.localTracks.push(...tracks);
                nextVideoTrack.addEventListener(
                    JitsiTrackEvents.LOCAL_TRACK_STOPPED, () => {
                        const trackToDispose = this.room.getLocalVideoTrack();
                        if (trackToDispose != null) {
                            this.localTracks.splice(this.localTracks.indexOf(trackToDispose), 1);
                            this.room.removeTrack(trackToDispose);
                        }
                        if (previousTrack) {
                            this.localTracks.push(previousTrack);
                            if (element) {
                                element.setTrack(previousTrack);
                            }
                            if (this.room.getLocalVideoTrack()) {
                                this.room.replaceTrack(this.room.getLocalVideoTrack()!, previousTrack);
                            } else {
                                this.room.addTrack(previousTrack);
                            }
                        }
                        ThisIsMyDepartmentApp.instance.showNotification("Screen sharing stopped.");
                    });
                if (element != null) {
                    element.setTrack(nextVideoTrack);
                }

                if (previousTrack) {
                    this.room.replaceTrack(previousTrack, nextVideoTrack);
                } else {
                    this.room.addTrack(nextVideoTrack);
                }

                ThisIsMyDepartmentApp.instance.showNotification(isScreenShareActive ? "Camera restored." : "Screen sharing started.");
            }
        })
            .catch(error => {
                console.log(error);
                const message = error instanceof Error && error.message
                    ? error.message
                    : String(error ?? "Unknown error");
                ThisIsMyDepartmentApp.instance.showNotification(`Screen share failed: ${message}`);
            });
    }

    public changeAudioOutput(deviceId: string): void {
        setStoredMediaDevicePreference(localStorage, "audioOutput", deviceId);
        this.JitsiMeetJS.mediaDevices.setAudioOutputDevice(deviceId);
    }

    public isLocalAudioEnabled(): boolean {
        return this.audioEnabled;
    }

    public isLocalVideoEnabled(): boolean {
        return this.videoEnabled;
    }

    public setLocalAudioEnabled(enabled: boolean): void {
        this.audioEnabled = enabled;
    }

    public setLocalVideoEnabled(enabled: boolean): void {
        this.videoEnabled = enabled;
    }

    public toggleLocalAudio(): boolean {
        this.setLocalAudioEnabled(!this.audioEnabled);
        return this.audioEnabled;
    }

    public toggleLocalVideo(): boolean {
        this.setLocalVideoEnabled(!this.videoEnabled);
        return this.videoEnabled;
    }

    public async syncConversationMedia(active: boolean): Promise<void> {
        if (!active || (!this.audioEnabled && !this.videoEnabled)) {
            this.releaseLocalTracks();
            return;
        }

        await this.ensureLocalTracks();
        this.applyLocalMediaPreferences();
    }

    public changeAudioInput(deviceId: string): void {
        setStoredMediaDevicePreference(localStorage, "audioInput", deviceId);
        if (this.localTracks.length > 0) {
            this.releaseLocalTracks();
            void this.ensureLocalTracks();
        }
    }

    public changeVideoInput(deviceId: string): void {
        setStoredMediaDevicePreference(localStorage, "videoInput", deviceId);
        if (this.localTracks.length > 0) {
            this.releaseLocalTracks();
            void this.ensureLocalTracks();
        }
    }

    private async ensureLocalTracks(): Promise<void> {
        if (this.localTracks.length > 0) {
            return;
        }
        if (this.localTrackCreationPromise) {
            return this.localTrackCreationPromise;
        }

        const micDeviceId = getStoredMediaDevicePreference(localStorage, "audioInput");
        const cameraDeviceId = getStoredMediaDevicePreference(localStorage, "videoInput");

        this.localTrackCreationPromise = this.JitsiMeetJS.createLocalTracks({ devices: ["audio", "video"], cameraDeviceId, micDeviceId })
            .then(async tracks => {
                await this.onLocalTracks(tracks);
            })
            .finally(() => {
                this.localTrackCreationPromise = undefined;
            });

        return this.localTrackCreationPromise;
    }

    private releaseLocalTracks(): void {
        const tracks = [...this.localTracks];
        this.localTracks = [];

        tracks.forEach(track => {
            try {
                if (this.isJoined) {
                    this.room.removeTrack(track);
                }
            } catch (_) {
                // Ignore remove failures for already-detached tracks.
            }
            try {
                track.dispose();
            } catch (_) {
                // Ignore dispose failures from half-initialized tracks.
            }
        });

        document.getElementById("localAudio")?.remove();
        document.getElementById("localUserVideo")?.remove();
    }

    private applyLocalMediaPreferences(): void {
        const localVideoElement = document.getElementById("localUserVideo") as UserVideoElement | null;

        this.localTracks.forEach(track => {
            if (track.getType() === "audio") {
                if (this.audioEnabled) {
                    track.unmute();
                } else {
                    track.mute();
                }
                return;
            }

            if (this.videoEnabled) {
                track.unmute();
            } else {
                track.mute();
            }
        });

        localVideoElement?.setVideoEnabled(this.videoEnabled);
    }
}
