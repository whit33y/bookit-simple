import { Readable } from 'node:stream';
import { PhotoStorage } from '../src/app/photos/photo-storage';

/** Keeps files in memory, so the tests run without MinIO, like CI. */
export class InMemoryPhotoStorage extends PhotoStorage {
  readonly files = new Map<string, { body: Buffer; contentType: string }>();

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    this.files.set(key, { body, contentType });
  }

  async get(key: string): Promise<Readable | null> {
    const file = this.files.get(key);
    return file ? Readable.from(file.body) : null;
  }

  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }
}
