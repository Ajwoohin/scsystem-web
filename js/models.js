export class BusStatus {
  static #info = {
    going_to_main: { label: 'Going to Main', tone: 'green', zone: 'main', moving: true },
    going_to_buena: { label: 'Going to Buena', tone: 'green', zone: 'buena', moving: true },
    on_break: { label: 'On Break', tone: 'red', zone: 'break', moving: false },
    waiting_in_buena: { label: 'Waiting in Buena', tone: 'amber', zone: 'buena', moving: false },
    waiting_in_main: { label: 'Waiting in Main', tone: 'amber', zone: 'main', moving: false },
  };

  static get all() {
    return Object.keys(BusStatus.#info);
  }

  static isValid(status) {
    return status in BusStatus.#info;
  }

  static label(status) {
    return BusStatus.#info[status]?.label ?? status;
  }

  static tone(status) {
    return BusStatus.#info[status]?.tone ?? 'gray';
  }

  static zone(status) {
    return BusStatus.#info[status]?.zone ?? 'break';
  }

  static isMoving(status) {
    return BusStatus.#info[status]?.moving ?? false;
  }
}

export class Bus {
  #status;

  constructor(row) {
    this.id = row.id;
    this.name = row.name;
    this.#status = row.status;
  }

  get status() {
    return this.#status;
  }

  set status(value) {
    if (BusStatus.isValid(value)) this.#status = value;
  }

  get label() {
    return BusStatus.label(this.#status);
  }

  get tone() {
    return BusStatus.tone(this.#status);
  }

  get zone() {
    return BusStatus.zone(this.#status);
  }

  get isMoving() {
    return BusStatus.isMoving(this.#status);
  }
}

export class Quest {
  constructor(row) {
    this.id = row.id;
    this.title = row.title ?? '';
    this.description = row.description ?? '';
    this.timeLimit = row.time_limit ?? '';
    this.reward = row.reward ?? 0;
    this.limit = row.acceptance_limit ?? 0;
    this.postedBy = row.posted_by ?? 'Administration';
    this.postedById = row.posted_by_id ?? '';
    this.status = row.status ?? 'open';
  }

  get isCompleted() {
    return this.status === 'completed';
  }
}

export async function recomputeQuestCompletion(db, quest) {
  const { error } = await db.rpc('recompute_quest_completion', { p_quest_id: quest.id, p_acceptance_limit: quest.limit });
  if (error) throw error;
}
