const { contextBridge, ipcRenderer, webUtils } = require("electron");

contextBridge.exposeInMainWorld("pet", {
  pathForFile: (file) => webUtils.getPathForFile(file),
  feed: (paths) => ipcRenderer.invoke("pet:feed", paths),
  walkSlide: (ms) => ipcRenderer.send("walk-slide", { ms }),
  cancelSlide: () => ipcRenderer.send("cancel-slide"),
  moveBy: (dx, dy, box) => ipcRenderer.send("pet:move-by", { dx, dy, box }),
  setPassThrough: (on) => ipcRenderer.send("pet:pass-through", on),
  hitBox: (box) => ipcRenderer.send("pet:hit-box", box),
  holdCapture: (on) => ipcRenderer.send("pet:hold-capture", !!on),
  onHungry: (cb) => {
    ipcRenderer.on("pet:hungry", (_event, on) => cb(!!on));
  },
  fitClip: (w, h) => ipcRenderer.send("clip:fit", { w, h }),
  fitIdle: () => ipcRenderer.send("clip:idle"),
  getStage: () => ipcRenderer.invoke("stage:get"),
  addExtra: (name) => ipcRenderer.invoke("extras:add", { name }),
  removeExtra: (id) => ipcRenderer.invoke("extras:remove", id),
  setActive: (id) => ipcRenderer.invoke("stage:setActive", id),
  downloadCast: (id) => ipcRenderer.invoke("cast:download", id),
  setShowAll: (on) => ipcRenderer.invoke("stage:setShowAll", on),
  setPetSize: (size) => ipcRenderer.invoke("stage:setPetSize", size),
  setDialogue: (payload) => ipcRenderer.invoke("cast:setDialogue", payload),
  addAction: (id, name) => ipcRenderer.invoke("cast:addAction", { id, name }),
  setActionWalk: (id, actionId, walk) =>
    ipcRenderer.invoke("cast:setActionWalk", { id, actionId, walk }),
  removeAction: (id, actionId) => ipcRenderer.invoke("cast:removeAction", { id, actionId }),
  onStage: (cb) => {
    const handler = (_event, stage) => cb(stage);
    ipcRenderer.on("stage:updated", handler);
  },
});
