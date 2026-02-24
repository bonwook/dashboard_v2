import { useState } from "react"

export interface TaskCounts {
  total: number
  pending: number
  in_progress: number
  on_hold: number
  completed: number
}

export function useTasks() {
  const [assignedTasks, setAssignedTasks] = useState<any[]>([])
  const [assignedByTasks, setAssignedByTasks] = useState<any[]>([])
  const [taskCounts, setTaskCounts] = useState<TaskCounts>({
    total: 0,
    pending: 0,
    in_progress: 0,
    on_hold: 0,
    completed: 0,
  })
  const [assignedByCounts, setAssignedByCounts] = useState<TaskCounts>({
    total: 0,
    pending: 0,
    in_progress: 0,
    on_hold: 0,
    completed: 0,
  })

  return {
    assignedTasks,
    setAssignedTasks,
    assignedByTasks,
    setAssignedByTasks,
    taskCounts,
    setTaskCounts,
    assignedByCounts,
    setAssignedByCounts,
  }
}
