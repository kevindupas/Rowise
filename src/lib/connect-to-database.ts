import { connectDb, getPassword, getSshPassword, getServerVersion, getTlsInfo } from "./tauri-commands";
import { useConnectionStore } from "../store/connections";
import type { Connection } from "../store/connections";

export async function connectToDatabase(sourceConn: Connection, dbName: string): Promise<void> {
  const store = useConnectionStore.getState();
  const { connections, addConnection, setConnected, setActiveConnection, setConnectionMeta } = store;

  let target = connections.find(c =>
    c.type === sourceConn.type &&
    c.host === sourceConn.host &&
    c.port === sourceConn.port &&
    c.username === sourceConn.username &&
    c.database === dbName
  ) ?? null;

  if (!target) {
    target = {
      ...sourceConn,
      id: crypto.randomUUID(),
      name: `${sourceConn.name.replace(/ \(.*\)$/, "")} (${dbName})`,
      database: dbName,
    };
    addConnection(target);
    const password = await getPassword(sourceConn.id).catch(() => "");
    if (password) {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_password", { connectionId: target.id, password }).catch(() => {});
    }
    if (sourceConn.ssh?.authMethod === "password") {
      const sshPw = await getSshPassword(sourceConn.id).catch(() => "");
      if (sshPw) {
        const { invoke } = await import("@tauri-apps/api/core");
        await invoke("save_password", { connectionId: `ssh-${target.id}`, password: sshPw }).catch(() => {});
      }
    }
  }

  if (store.connectedIds.has(target.id)) {
    setActiveConnection(target.id);
    return;
  }

  const password = await getPassword(target.id).catch(() => "");
  const sshPassword = target.ssh?.authMethod === "password"
    ? await getSshPassword(target.id).catch(() => "")
    : undefined;

  const config = {
    id: target.id, name: target.name, db_type: target.type,
    host: target.host, port: target.port, database: target.database,
    username: target.username, password, color: target.color,
    ssh_host: target.ssh?.host, ssh_port: target.ssh?.port,
    ssh_username: target.ssh?.username, ssh_auth_method: target.ssh?.authMethod,
    ssh_password: sshPassword, ssh_private_key_path: target.ssh?.privateKeyPath,
    ssh_use_password_auth: target.ssh?.usePasswordAuth,
    ssh_add_legacy_host_key: target.ssh?.addLegacyHostKeyAlgos,
    ssh_add_legacy_kex: target.ssh?.addLegacyKexAlgos,
    ssh_backend: target.ssh?.backend,
  };

  await connectDb(config);
  setConnected(target.id, true);

  Promise.all([
    getServerVersion(config).catch(() => undefined),
    getTlsInfo(config).catch(() => null),
  ]).then(([serverVersion, tlsVersion]) => {
    setConnectionMeta(target!.id, { serverVersion, tlsVersion });
  });

  setActiveConnection(target.id);
}
