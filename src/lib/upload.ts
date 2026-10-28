import { MAX_BYTES } from './csv-import'
import { HttpError } from './http'

// Reads the "file" field of a multipart upload, refusing bodies larger than the CSV limit.
export async function readUpload(req: Request): Promise<Uint8Array> {
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BYTES + 64_000) throw new HttpError(413, 'File too large.')
  let form: FormData
  try { form = await req.formData() } catch { throw new HttpError(400, 'Upload a CSV file in the "file" field.') }
  const file = form.get('file')
  if (!(file instanceof File)) throw new HttpError(400, 'Upload a CSV file in the "file" field.')
  if (file.size > MAX_BYTES) throw new HttpError(413, 'File too large.')
  return new Uint8Array(await file.arrayBuffer())
}
