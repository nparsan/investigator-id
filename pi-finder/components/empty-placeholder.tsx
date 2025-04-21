import { Search } from "lucide-react"

interface EmptyPlaceholderProps {
  message: string
}

export function EmptyPlaceholder({ message }: EmptyPlaceholderProps) {
  return (
    <div
      className="flex flex-col items-center justify-center p-10 text-center rounded-2xl border border-dashed border-gray-300 bg-gray-50 shadow-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gray-100">
        <Search className="h-10 w-10 text-gray-400" aria-hidden="true" />
      </div>
      <h3 className="mt-6 text-lg font-semibold text-gray-900">{message}</h3>
    </div>
  )
}
