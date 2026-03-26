"""Advanced Agent Service - ReAct loop execution"""

import asyncio
from typing import Optional
from pathlib import Path
from datetime import datetime

from backend.core.llm_client import llm_client
from backend.services.event_service import event_service, SSEEventType
from backend.models.execution import ExecutionStatus, execution_storage
from backend.services.agent_tools import TOOLS_SCHEMA, execute_tool

class AdvancedAgentService:
    def __init__(self):
        pass

    async def execute(
        self,
        prompt: str,
        team_id: str,
        workdir: Optional[str] = None,
        execution_id: Optional[str] = None,
    ) -> None:
        """Run the ReAct agent loop."""
        # Ensure we have a valid execution record
        if not execution_id:
            return
            
        record = execution_storage.load(execution_id)
        if not record:
            return

        # Initialize messages
        messages = [
            {"role": "user", "content": prompt}
        ]
        
        system_prompt = (
            "You are an expert Super Project Manager overseeing an AI autonomous development team.\n"
            "You are working in a ReAct loop: Reason -> Act -> Observe -> Repeat.\n"
            "You DO NOT write code directly. Instead, you orchestrate AI workers using the provided management tools.\n"
            "1. Break down the user's request into actionable tasks using `create_task`.\n"
            "2. Hire appropriate AI workers (e.g., frontend, backend engineers) using `hire_worker`.\n"
            "3. Assign tasks to workers using `assign_task` and start their execution using `trigger_worker`.\n"
            "4. Periodically use `list_tasks` and `list_workers` to monitor progress.\n"
            "Only stop and return a final message when you have verified that all assigned tasks have reached 'completed' status.\n"
            f"Your managed team ID is: {team_id}\n"
            f"The team's designated working directory is: {workdir or 'Managed by Platform'}"
        )

        try:
            event_service.emit_sync(team_id, SSEEventType.EXECUTION_STARTED, {
                "execution_id": execution_id,
                "prompt": prompt
            })

            loop_count = 0
            max_loops = 30  # Prevent infinite loops

            while loop_count < max_loops:
                loop_count += 1
                
                # Check for stop signal
                current_record = execution_storage.load(execution_id)
                if current_record and current_record.status == ExecutionStatus.STOPPED:
                    event_service.emit_sync(team_id, SSEEventType.EXECUTION_STOPPED, {"reason": "User stopped execution"})
                    break

                # 1. 思考
                log = record.add_log(
                    log_type="thinking",
                    step="thinking",
                    content=f"🤔 正在思考第 {loop_count} 轮..."
                )
                execution_storage.save(record)
                event_service.emit_sync(team_id, SSEEventType.EXECUTION_THINKING, log.to_sse_data())
                
                # 2. 调用 LLM
                response = llm_client.chat(
                    messages=messages,
                    system=system_prompt,
                    tools=TOOLS_SCHEMA
                )
                
                # Append the assistant's turn to messages
                assistant_message = {"role": "assistant", "content": response.content}
                messages.append(assistant_message)
                
                # Extract text thinking part
                text_content = ""
                for component in response.content:
                    if component.type == "text":
                        text_content += component.text + "\n"
                        
                if text_content.strip():
                    log = record.add_log(
                        log_type="thinking",
                        step="reasoning",
                        content=f"🧠 思考输出:\n{text_content.strip()}"
                    )
                    execution_storage.save(record)
                    event_service.emit_sync(team_id, SSEEventType.EXECUTION_THINKING, log.to_sse_data())

                # Check if it invoked tools
                has_tool_call = False
                for component in response.content:
                    if component.type == "tool_use":
                        has_tool_call = True
                        tool_name = component.name
                        tool_args = component.input
                        tool_id = component.id
                        
                        # Emit tool execution event
                        log = record.add_log(
                            log_type="step",
                            step="tool_call",
                            content=f"🛠️ 正在执行工具: {tool_name}\n参数: {tool_args}"
                        )
                        execution_storage.save(record)
                        event_service.emit_sync(team_id, SSEEventType.EXECUTION_STEP, log.to_sse_data())
                        
                        # Execute management tool
                        tool_result = await execute_tool(tool_name, tool_args, team_id, workdir=workdir)
                        
                        log = record.add_log(
                            log_type="step",
                            step="tool_result",
                            content=f"📌 工具执行结果:\n{tool_result[:500]}{'...' if len(tool_result)>500 else ''}"
                        )
                        execution_storage.save(record)
                        event_service.emit_sync(team_id, SSEEventType.EXECUTION_STEP, log.to_sse_data())
                        
                        # Append tool result to messages
                        messages.append({
                            "role": "user",
                            "content": [
                                {
                                    "type": "tool_result",
                                    "tool_use_id": tool_id,
                                    "content": tool_result
                                }
                            ]
                        })
                        
                # If no tools were called, the agent considers the task done
                if not has_tool_call:
                    current_record = execution_storage.load(execution_id)
                    current_record.status = ExecutionStatus.COMPLETED
                    current_record.completed_at = datetime.now()
                    current_record.completed_tasks = 1
                    current_record.total_tasks = 1
                    execution_storage.save(current_record)
                    break

            if loop_count >= max_loops:
                current_record = execution_storage.load(execution_id)
                current_record.status = ExecutionStatus.FAILED
                current_record.completed_at = datetime.now()
                log = current_record.add_log("execution_failed", "timeout", "达到最大执行轮数限制 (30)。")
                execution_storage.save(current_record)
                event_service.emit_sync(team_id, SSEEventType.EXECUTION_FAILED, log.to_sse_data())
            
        except Exception as e:
            current_record = execution_storage.load(execution_id)
            if current_record:
                current_record.status = ExecutionStatus.FAILED
                current_record.completed_at = datetime.now()
                log = current_record.add_log("execution_failed", "error", f"执行异常: {str(e)}")
                execution_storage.save(current_record)
                event_service.emit_sync(team_id, SSEEventType.EXECUTION_FAILED, log.to_sse_data())

advanced_agent = AdvancedAgentService()
