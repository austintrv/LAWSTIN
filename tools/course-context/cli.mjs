import { ContextStore } from "./store.mjs";
async function main() {
  const command = process.argv[2] || "doctor", course = process.argv[3];
  const store = await ContextStore.open();
  if (command === "doctor") {
    const statuses = [];
    for (const { id, name } of await store.list()) {
      const context = await store.read(id);
      statuses.push({ id, name, memoryReadable: true, privateCheckpoint: context.checkpoint });
    }
    console.log(JSON.stringify({ courses: statuses, appConnections: "Settings on disk do not prove a live connection. In each app, ask LAWSTIN Course Context to list courses and read one." }, null, 2));
  } else if (command === "history") console.log(JSON.stringify(await store.history(course), null, 2));
  else if (command === "checkpoint") console.log(JSON.stringify(await store.read(course).then(({ course, checkpoint, revision }) => ({ course, checkpoint, revision })), null, 2));
  else throw new Error("Use doctor, history <course>, or checkpoint <course>.");
}
main().catch(error => { console.error(`LAWSTIN course context: ${error.message}`); process.exitCode = 1; });
