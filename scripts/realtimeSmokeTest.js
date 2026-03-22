const io = require("socket.io-client");

const realtimeUrl = process.env.TIMD_REALTIME_URL || "http://127.0.0.1:8787";
const roomId = process.env.TIMD_SMOKE_ROOM || `smoke-room-${Date.now()}`;
const timeoutMs = Number(process.env.TIMD_SMOKE_TIMEOUT_MS || 8000);

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function createClient(userId, username) {
    const socket = io(realtimeUrl, {
        query: { room: roomId, userId, username },
        transports: ["websocket"],
        reconnection: false,
        timeout: timeoutMs,
        autoConnect: false
    });
    return socket;
}

function waitForEvent(socket, eventName, predicate, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off(eventName, onEvent);
            reject(new Error(`Timed out waiting for ${label}`));
        }, timeoutMs);

        const onEvent = value => {
            try {
                if (!predicate(value)) {
                    return;
                }
                clearTimeout(timer);
                socket.off(eventName, onEvent);
                resolve(value);
            } catch (error) {
                clearTimeout(timer);
                socket.off(eventName, onEvent);
                reject(error);
            }
        };

        socket.on(eventName, onEvent);
    });
}

function waitForConnect(socket, label) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            socket.off("connect", onConnect);
            socket.off("connect_error", onConnectError);
            reject(new Error(`Timed out waiting for ${label} connect`));
        }, timeoutMs);

        const onConnect = () => {
            clearTimeout(timer);
            socket.off("connect_error", onConnectError);
            resolve();
        };

        const onConnectError = error => {
            clearTimeout(timer);
            socket.off("connect", onConnect);
            reject(error instanceof Error ? error : new Error(String(error)));
        };

        socket.once("connect", onConnect);
        socket.once("connect_error", onConnectError);
    });
}

async function main() {
    const alice = createClient("smoke-alice", "Smoke Alice");
    let bob = createClient("smoke-bob", "Smoke Bob");

    const cleanup = async () => {
        try {
            alice.close();
        } catch (_) {
            // Ignore cleanup failures.
        }
        try {
            bob.close();
        } catch (_) {
            // Ignore cleanup failures.
        }
        await wait(100);
    };

    try {
        const roomReadyOnAlice = waitForEvent(
            alice,
            "roomInfo",
            payload => Array.isArray(payload.userIds) && payload.userIds.includes("smoke-alice") && payload.userIds.includes("smoke-bob"),
            "room membership on alice"
        );
        const roomReadyOnBob = waitForEvent(
            bob,
            "roomInfo",
            payload => Array.isArray(payload.userIds) && payload.userIds.includes("smoke-alice") && payload.userIds.includes("smoke-bob"),
            "room membership on bob"
        );

        const aliceConnected = waitForConnect(alice, "alice");
        const bobConnected = waitForConnect(bob, "bob");
        alice.connect();
        bob.connect();

        await Promise.all([aliceConnected, bobConnected]);
        await Promise.all([roomReadyOnAlice, roomReadyOnBob]);

        const bobSeesAlice = waitForEvent(
            bob,
            "characterUpdate",
            payload => payload && payload.userId === "smoke-alice" && payload.position && payload.position.x === 11 && payload.position.y === 22,
            "alice update on bob"
        );
        alice.emit("characterUpdate", { position: { x: 11, y: 22 }, spriteIndex: 2 });
        await bobSeesAlice;

        const aliceSeesBob = waitForEvent(
            alice,
            "characterUpdate",
            payload => payload && payload.userId === "smoke-bob" && payload.position && payload.position.x === 33 && payload.position.y === 44,
            "bob update on alice"
        );
        bob.emit("characterUpdate", { position: { x: 33, y: 44 }, spriteIndex: 3 });
        await aliceSeesBob;

        const bobReceivesDirectMessage = waitForEvent(
            bob,
            "directMessage",
            payload => payload && payload.fromUserId === "smoke-alice" && payload.toUserId === "smoke-bob" && payload.text === "hello bob",
            "direct message on bob"
        );
        alice.emit("directMessage", { targetUserId: "smoke-bob", text: "hello bob" });
        await bobReceivesDirectMessage;

        const aliceSeesConversationOpen = waitForEvent(
            alice,
            "playerConversationEvent",
            payload => payload && payload.fromUserId === "smoke-bob" && payload.toUserId === "smoke-alice" && payload.action === "open",
            "conversation open on alice"
        );
        bob.emit("playerConversationEvent", { targetUserId: "smoke-alice", action: "open" });
        await aliceSeesConversationOpen;

        const aliceSeesConversationClose = waitForEvent(
            alice,
            "playerConversationEvent",
            payload => payload && payload.fromUserId === "smoke-bob" && payload.toUserId === "smoke-alice" && payload.action === "close",
            "conversation close on alice"
        );
        bob.emit("playerConversationEvent", { targetUserId: "smoke-alice", action: "close" });
        await aliceSeesConversationClose;

        const aliceSeesBobLeave = waitForEvent(
            alice,
            "roomInfo",
            payload => payload && payload.playerLeftUserId === "smoke-bob",
            "bob disconnect on alice"
        );
        bob.close();
        await aliceSeesBobLeave;

        bob = createClient("smoke-bob", "Smoke Bob");
        const aliceSeesBobRejoin = waitForEvent(
            alice,
            "roomInfo",
            payload => payload && payload.playerJoinedUserId === "smoke-bob",
            "bob reconnect on alice"
        );
        const bobReconnects = waitForConnect(bob, "bob reconnect");
        bob.connect();
        await bobReconnects;
        await aliceSeesBobRejoin;

        const aliceSeesBobAfterReconnect = waitForEvent(
            alice,
            "characterUpdate",
            payload => payload && payload.userId === "smoke-bob" && payload.position && payload.position.x === 55 && payload.position.y === 66,
            "bob update after reconnect on alice"
        );
        bob.emit("characterUpdate", { position: { x: 55, y: 66 }, spriteIndex: 4 });
        await aliceSeesBobAfterReconnect;

        console.log(JSON.stringify({
            ok: true,
            realtimeUrl,
            roomId,
            checks: [
                "room membership sync",
                "alice characterUpdate reaches bob",
                "bob characterUpdate reaches alice",
                "directMessage relay",
                "playerConversationEvent open relay",
                "playerConversationEvent close relay",
                "disconnect broadcast with stable userId",
                "reconnect broadcast with stable userId",
                "post-reconnect characterUpdate relay"
            ]
        }, null, 2));
    } finally {
        await cleanup();
    }
}

main().catch(error => {
    console.error(error && error.stack ? error.stack : String(error));
    process.exitCode = 1;
});