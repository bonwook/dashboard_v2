import { useState, useEffect } from "react"
import { useTasks } from "./useTasks"

export function useTaskData() {
  const {
    assignedTasks,
    setAssignedTasks,
    assignedByTasks,
    setAssignedByTasks,
    taskCounts,
    setTaskCounts,
    assignedByCounts,
    setAssignedByCounts,
  } = useTasks()

  const [user, setUser] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let isMounted = true

    const loadUserData = async () => {
      try {
        const userRes = await fetch("/api/auth/me", {
          credentials: "include",
        })
        if (userRes.ok) {
          const userData = await userRes.json()
          if (isMounted) {
            setUser(userData)
          }
        }
      } catch (error) {
        // Silent error handling
      }
    }

    const updateTaskData = async () => {
      try {
        // Task counts
        const taskCountsRes = await fetch("/api/tasks/count", {
          credentials: "include",
        })
        if (taskCountsRes.ok && isMounted) {
          const taskCountsData = await taskCountsRes.json()
          setTaskCounts(taskCountsData)
        }

        // Assigned by counts
        const assignedByCountsRes = await fetch("/api/tasks/assigned-by-count", {
          credentials: "include",
        })
        if (assignedByCountsRes.ok && isMounted) {
          const assignedByCountsData = await assignedByCountsRes.json()
          setAssignedByCounts(assignedByCountsData)
        }

        // Assigned tasks
        const assignedTasksRes = await fetch("/api/tasks", {
          credentials: "include",
        })
        if (assignedTasksRes.ok && isMounted) {
          const assignedTasksData = await assignedTasksRes.json()
          const sortedTasks = (assignedTasksData.tasks || [])
            .filter((task: any) => task.status !== 'completed')
            .sort((a: any, b: any) => {
              const dateA = new Date(a.created_at).getTime()
              const dateB = new Date(b.created_at).getTime()
              return dateB - dateA
            })
          setAssignedTasks(sortedTasks)
        }

        // Assigned by tasks
        const assignedByTasksRes = await fetch("/api/tasks/assigned-by", {
          credentials: "include",
        })
        if (assignedByTasksRes.ok && isMounted) {
          const assignedByTasksData = await assignedByTasksRes.json()
          const sortedTasks = (assignedByTasksData.tasks || [])
            .filter((task: any) => task.status !== 'completed')
            .sort((a: any, b: any) => {
              const dateA = new Date(a.created_at).getTime()
              const dateB = new Date(b.created_at).getTime()
              return dateB - dateA
            })
          setAssignedByTasks(sortedTasks)
        }
      } catch (error) {
        // Silent error handling
      }
    }

    const loadAllData = async () => {
      await loadUserData()
      await updateTaskData()
      if (isMounted) {
        setIsLoading(false)
      }
    }

    loadAllData()

    // 주기적 업데이트 (10초마다)
    const interval = setInterval(async () => {
      if (document.visibilityState === 'visible' && isMounted) {
        await updateTaskData()
      }
    }, 10000)

    // 포커스 시 즉시 업데이트
    const handleFocus = () => {
      if (isMounted) {
        updateTaskData()
      }
    }
    window.addEventListener('focus', handleFocus)

    return () => {
      isMounted = false
      clearInterval(interval)
      window.removeEventListener('focus', handleFocus)
    }
  }, [setAssignedTasks, setAssignedByTasks, setTaskCounts, setAssignedByCounts])

  return {
    user,
    isLoading,
    assignedTasks,
    assignedByTasks,
    taskCounts,
    assignedByCounts,
  }
}
