export class Live {
  #db;
  #channels = [];
  #timers = new Set();

  constructor(db) {
    this.#db = db;
  }

  watch(table, onChange, filter) {
    const options = { event: '*', schema: 'public', table };
    if (filter) options.filter = filter;
    let timer = null;
    const handler = () => {
      clearTimeout(timer);
      timer = setTimeout(onChange, 200);
      this.#timers.add(timer);
    };
    const name = `${table}-${Math.random().toString(36).slice(2)}`;
    this.#channels.push(this.#db.channel(name).on('postgres_changes', options, handler).subscribe());
  }

  stop() {
    this.#channels.forEach((channel) => this.#db.removeChannel(channel));
    this.#timers.forEach((timer) => clearTimeout(timer));
    this.#channels = [];
    this.#timers.clear();
  }
}
