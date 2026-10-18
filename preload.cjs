const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("pet", {
  walkSlide: (ms) => ipcRenderer.send("walk-slide", { ms }),
  cancelSlide: () => ipcRenderer.send("cancel-slide"),
  fitClip: (w, h) => ipcRenderer.send("clip:fit", { w, h }),
  fitIdle: () => ipcRenderer.send("clip:idle"),
  getStage: () => ipcRenderer.invoke("stage:get"),
  addExtra: (name) => ipcRenderer.invoke("extras:add", { name }),
  removeExtra: (id) => ipcRenderer.invoke("extras:remove", id),
  setActive: (id) => ipcRenderer.invoke("stage:setActive", id),
  setShowAll: (on) => ipcRenderer.invoke("stage:setShowAll", on),
  setPetSize: (size) => ipcRenderer.invoke("stage:setPetSize", size),
  onStage: (cb) => {
    const handler = (_event, stage) => cb(stage);
    ipcRenderer.on("stage:updated", handler);
  },
});
