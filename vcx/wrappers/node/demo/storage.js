import storage from 'node-persist'

export async function createStorage(name) {
  const storageInstance = storage.create({dir: `tmp-${name}`});
  storageInstance.init();

  async function set(id, data) {
    return storageInstance.set(id, data);
  }

  async function get(id) {
    return storageInstance.get(id);
  }

  async function values() {
    return storageInstance.values()
  }

  async function keys() {
    return storageInstance.keys()
  }

  return {
    set,
    get,
    values,
    keys
  }

}