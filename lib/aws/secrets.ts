import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager"

const region = process.env.AWS_REGION || "ap-northeast-2"
const client = new SecretsManagerClient({ region })

/** AWS Secrets Manager에 저장된 DB 비밀번호 조회 (시크릿이 JSON이면 password 필드 사용, 아니면 전체 문자열) */
export async function getDbPasswordFromSecretsManager(): Promise<string> {
  const secretNameOrArn = process.env.AWS_DB_SECRET_NAME || process.env.DB_SECRET_ARN
  if (!secretNameOrArn) {
    throw new Error("AWS_DB_SECRET_NAME or DB_SECRET_ARN is required when using Secrets Manager")
  }

  const command = new GetSecretValueCommand({
    SecretId: secretNameOrArn,
  })
  const response = await client.send(command)
  const raw = response.SecretString
  if (raw == null) {
    throw new Error("Secret value is empty")
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>
    if (typeof parsed.password === "string") return parsed.password
    if (typeof parsed.DB_PASSWORD === "string") return parsed.DB_PASSWORD
  } catch {
    // JSON이 아니면 전체를 비밀번호로 사용
  }
  return raw
}

/**
 * DB 비밀번호 반환. AWS Secrets Manager에서만 조회합니다.
 * AWS_DB_SECRET_NAME 또는 DB_SECRET_ARN 환경 변수가 필요합니다.
 */
export async function getDbPassword(): Promise<string> {
  return getDbPasswordFromSecretsManager()
}
