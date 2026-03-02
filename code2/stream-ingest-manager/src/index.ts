import { Kafka } from "kafkajs";
import { exec } from "child_process";

const TENANT_CONFIG: Record<string, {
    minWorkers: number;
    maxWorkers: number;
}> = {
    "tenant-a": {
        minWorkers: 1,
        maxWorkers: 5,
    },
    "tenant-b": {
        minWorkers: 1,
        maxWorkers: 4,
    }
};

const TENANTS = Object.keys(TENANT_CONFIG);

const kafka = new Kafka({
    brokers: ["localhost:29092"], // should be run outside docker
});

const consumer = kafka.consumer({
    groupId: "manager-group",
});

function execAsync(cmd: string) {
    return new Promise<void>((resolve, reject) => {
        exec(cmd, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

const currentWorkers: Record<string, number> = {};

async function scaleWorkers(tenantId: string, newCount: number) {
    const serviceName = `${tenantId}-worker`;

    console.log(`Scaling ${tenantId} to ${newCount} workers`);

    await execAsync(
        `docker compose up -d --scale ${serviceName}=${newCount} ${serviceName}`
    );

    currentWorkers[tenantId] = newCount;
}

async function handleAction(tenantId: string, action: string) {
    const config = TENANT_CONFIG[tenantId];
    if (!config) {
        console.warn(`Unknown tenant: ${tenantId}`);
        return;
    }

    const current = currentWorkers[tenantId] ?? config.minWorkers;

    if (action === "scale_up") {
        if (current < config.maxWorkers) {
            await scaleWorkers(tenantId, current + 1);
        } else {
            console.log(`${tenantId} already at max workers`);
        }
        return;
    }

    if (action === "scale_down") {
        if (current > config.minWorkers) {
            await scaleWorkers(tenantId, current - 1);
        } else {
            console.log(`${tenantId} at minimum workers, not scaling down`);
        }
    }
}

async function start() {
    await consumer.connect();
    await consumer.subscribe({
        topic: "manager-control",
        fromBeginning: false,
    });

    console.log("StreamingIngestManager started");
    console.log("Managing tenants:", TENANTS);

    // Ensure minimum workers on startup
    for (const tenant of TENANTS) {
        const min = TENANT_CONFIG[tenant]!.minWorkers;
        await scaleWorkers(tenant, min);
    }

    await consumer.run({
        eachMessage: async ({ message }) => {
            try {
                const payload = JSON.parse(message.value!.toString());
                const { tenant_id, action } = payload;

                await handleAction(tenant_id, action);

            } catch (err) {
                console.error("Failed to process manager-control message:", err);
            }
        },
    });
}

start();