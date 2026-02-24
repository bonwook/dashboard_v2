/**
 * 비동기 이터레이터를 고정 크기 배치로 묶기
 */
export async function* inBatches<T>(
  iter: AsyncGenerator<T>,
  batchSize: number
): AsyncGenerator<T[]> {
  let batch: T[] = []
  for await (const item of iter) {
    batch.push(item)
    if (batch.length >= batchSize) {
      yield batch
      batch = []
    }
  }
  if (batch.length > 0) yield batch
}
