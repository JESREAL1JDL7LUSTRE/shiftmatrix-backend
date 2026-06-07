import { evaluateEligibility } from './rulesEngine'
import { User, Shift } from '../payload-types'

type ShiftReqSlot = {
  shiftId: string
  shift: Shift
  blockIndex: number
  block: any
}

class MaxFlowGraph {
  nodes: number
  capacity: number[][]
  flow: number[][]
  adj: number[][]

  constructor(nodes: number) {
    this.nodes = nodes
    this.capacity = Array.from({ length: nodes }, () => Array(nodes).fill(0))
    this.flow = Array.from({ length: nodes }, () => Array(nodes).fill(0))
    this.adj = Array.from({ length: nodes }, () => [])
  }

  addEdge(u: number, v: number, cap: number) {
    this.capacity[u][v] = cap
    this.adj[u].push(v)
    this.adj[v].push(u) // residual edge back
  }

  bfs(s: number, t: number, parent: number[]): boolean {
    const visited = Array(this.nodes).fill(false)
    const queue: number[] = [s]
    visited[s] = true
    parent[s] = -1

    while (queue.length > 0) {
      const u = queue.shift()!
      for (const v of this.adj[u]) {
        if (!visited[v] && this.capacity[u][v] - this.flow[u][v] > 0) {
          queue.push(v)
          parent[v] = u
          visited[v] = true
          if (v === t) return true
        }
      }
    }
    return false
  }

  edmondsKarp(s: number, t: number): number {
    let maxFlow = 0
    const parent = Array(this.nodes).fill(-1)

    while (this.bfs(s, t, parent)) {
      let pathFlow = Infinity
      let s_node = t

      while (s_node !== s) {
        const p = parent[s_node]
        pathFlow = Math.min(pathFlow, this.capacity[p][s_node] - this.flow[p][s_node])
        s_node = p
      }

      maxFlow += pathFlow
      let v = t

      while (v !== s) {
        const u = parent[v]
        this.flow[u][v] += pathFlow
        this.flow[v][u] -= pathFlow
        v = u
      }
    }
    return maxFlow
  }
}

export function buildAndRunMaxFlow(
  workers: User[],
  shifts: Shift[],
  tenantSettings: any,
  workerScheduledShifts: Record<string, Shift[]>,
  workerCurrentHours: Record<string, number>
) {
  const reqSlots: ShiftReqSlot[] = []
  
  for (const shift of shifts) {
    const reqs = shift.staffingRequirements || []
    reqs.forEach((reqBlock, blockIndex) => {
      const count = (reqBlock as any).count || 1
      for (let i = 0; i < count; i++) {
         reqSlots.push({
           shiftId: shift.id,
           shift,
           blockIndex,
           block: reqBlock
         })
      }
    })
  }

  const numWorkers = workers.length
  const numSlots = reqSlots.length
  const S = 0
  const T = numWorkers + numSlots + 1
  const numNodes = T + 1

  const graph = new MaxFlowGraph(numNodes)

  // Edge from Source to Worker (capacity = estimated remaining shifts)
  for (let i = 0; i < numWorkers; i++) {
    const worker = workers[i]
    const limit = worker.maxWeeklyHours || tenantSettings?.maxWeeklyHours || 40
    const remaining = Math.max(0, limit - (workerCurrentHours[worker.id] || 0))
    const cap = Math.floor(remaining / 8) // Approximating 8h per shift for flow capacity
    if (cap > 0) {
      graph.addEdge(S, i + 1, cap)
    }
  }

  // Edge from Worker to Requirement Slot
  for (let i = 0; i < numWorkers; i++) {
    const worker = workers[i]
    for (let j = 0; j < numSlots; j++) {
      const slot = reqSlots[j]
      const { eligible } = evaluateEligibility(
        worker, 
        slot.shift, 
        slot.block, 
        tenantSettings, 
        workerScheduledShifts[worker.id] || [],
        workerCurrentHours[worker.id] || 0
      )
      
      if (eligible) {
        graph.addEdge(i + 1, numWorkers + 1 + j, 1) // Capacity is exactly 1 assignment
      }
    }
  }

  // Edge from Slot to Sink
  for (let j = 0; j < numSlots; j++) {
    graph.addEdge(numWorkers + 1 + j, T, 1)
  }

  const totalFlow = graph.edmondsKarp(S, T)

  const assignments: { workerId: string, shiftId: string, blockIndex: number }[] = []
  
  for (let i = 0; i < numWorkers; i++) {
    for (let j = 0; j < numSlots; j++) {
      const u = i + 1
      const v = numWorkers + 1 + j
      if (graph.flow[u][v] === 1) {
         assignments.push({
           workerId: workers[i].id,
           shiftId: reqSlots[j].shiftId,
           blockIndex: reqSlots[j].blockIndex
         })
      }
    }
  }

  return { totalFlow, assignments }
}
