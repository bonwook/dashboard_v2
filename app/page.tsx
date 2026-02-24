import { Button } from "@/components/ui/button"
import Link from "next/link"

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-6 bg-gradient-to-b from-background to-muted/20">
      <div className="text-center space-y-2">
        <h1 className="text-5xl font-bold tracking-tight bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
          Flonics
        </h1>
        <p className="text-xl text-muted-foreground">4D Flow MRI Analysis Dashboard</p>
        <p className="text-sm text-muted-foreground">Professional cardiovascular imaging analysis platform</p>
      </div>

      <div className="flex gap-4">
        <Button asChild size="lg">
          <Link href="/auth/login">Login</Link>
        </Button>
        <Button asChild size="lg">
          <Link href="/auth/signup">Sign Up</Link>
        </Button>
      </div>
    </div>
  )
}
