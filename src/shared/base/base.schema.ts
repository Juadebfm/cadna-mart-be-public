export class BaseSchema {
  _id!: string;
  id!: string;
  deletedAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;

  get isDeleted(): boolean {
    return this.deletedAt !== null;
  }
}
