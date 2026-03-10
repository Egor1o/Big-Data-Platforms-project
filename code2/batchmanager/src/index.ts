import { exec } from "child_process";
import os from "os";

const CHECK_INTERVAL_MS = 10000;

const TENANT_CONFIG: Record<string, {
    max_parallel_runs: number;
}> = {
    "tenant-a": {
        max_parallel_runs: 2,
    },
    "tenant-b": {
        max_parallel_runs: 1,
    }
};

const runningPipelines: Record<string, number> = {};

function execAsync(cmd: string) {
    return new Promise<void>((resolve, reject) => {
        exec(cmd, (err, stdout, stderr) => {
            if (err) {
                console.error(stderr);
                reject(err);
            } else {
                console.log(stdout);
                resolve();
            }
        });
    });
}
function canRunPipeline(): boolean {
    const load = os.loadavg()[0] ?? 100000;
    const cpuCount = os.cpus().length;
    const ratio = load / cpuCount;

    console.log(`CPU load ratio: ${ratio.toFixed(2)}`);

    return ratio < 1.2;
}

async function runPipeline(tenantId: string) {
    const config = TENANT_CONFIG[tenantId];
    if (!config) return;


    if(!canRunPipeline()){
        console.log(`System under high load (bellow 80% capacity), skipping pipeline run for ${tenantId}`);
    }

    const currentRunning = runningPipelines[tenantId] || 0;

    if (currentRunning >= config.max_parallel_runs) {
        console.log(`${tenantId} pipeline already running, skipping`);
        return;
    }

    runningPipelines[tenantId] = currentRunning + 1;

    console.log(`Starting silver pipeline for ${tenantId}`);

    try {
        await execAsync(
            `docker compose up --no-deps ${tenantId}-silver`
        );
        console.log(`Silver pipeline finished for ${tenantId}`);
    } catch (err) {
        console.error(`Silver pipeline failed for ${tenantId}`);
    } finally {
        runningPipelines[tenantId]--;
    }
}

async function start() {
    console.log("BatchManager started");

    setInterval(async () => {
        for (const tenantId of Object.keys(TENANT_CONFIG)) {
            await runPipeline(tenantId);
        }
    }, CHECK_INTERVAL_MS);
}

start();