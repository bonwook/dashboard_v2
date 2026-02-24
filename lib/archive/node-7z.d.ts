declare module "node-7z" {
  interface ListOptions {
    $bin?: string
    password?: string
  }
  interface ExtractOptions extends ListOptions {
    password?: string
  }
  interface SevenStream {
    on(event: "end", fn: () => void): SevenStream
    on(event: "error", fn: (err: Error) => void): SevenStream
    on(event: "data", fn: (data: unknown) => void): SevenStream
  }
  export function extractFull(
    archive: string,
    outDir: string,
    options?: ExtractOptions
  ): SevenStream
  export function list(archive: string, options?: ListOptions): SevenStream
}
