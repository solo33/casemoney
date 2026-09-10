from app.api.responses import operation_response
"""HTTP routes; application operations own validation and transaction boundaries."""
from app.api.dependencies import current_user_id as get_current_user_id
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from app.api.financial_dependencies import financial_db
from app.schemas.goal import GoalCreate, GoalUpdate, GoalResponse
from app.operations.goals import queries, commands
from app.schemas.goals_views import ContributionCreate


router = APIRouter(prefix="/api/goals", tags=["goals"])

@router.get("/", response_model=List[GoalResponse])
def list_goals(
    include_archived: bool = False,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(queries.list_goals(include_archived=include_archived, db=db, user_id=user_id))


@router.post("/", response_model=GoalResponse, status_code=201)
def create_goal(
    data: GoalCreate,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.create_goal(data=data, db=db, user_id=user_id))


@router.patch("/{goal_id}", response_model=GoalResponse)
def update_goal(
    goal_id: int,
    data: GoalUpdate,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.update_goal(goal_id=goal_id, data=data, db=db, user_id=user_id))


@router.delete("/{goal_id}", status_code=204)
def delete_goal(
    goal_id: int,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.delete_goal(goal_id=goal_id, db=db, user_id=user_id))


@router.post("/{goal_id}/archive", response_model=GoalResponse)
def archive_goal(
    goal_id: int,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.archive_goal(goal_id=goal_id, db=db, user_id=user_id))


@router.post("/{goal_id}/restore", response_model=GoalResponse)
def restore_goal(
    goal_id: int,
    db: Session = Depends(financial_db, scope="function"),
    user_id: int = Depends(get_current_user_id),
):
    return operation_response(commands.restore_goal(goal_id=goal_id, db=db, user_id=user_id))


@router.post("/{goal_id}/contributions", response_model=GoalResponse)
def add_contribution(goal_id: int, data: ContributionCreate, db: Session = Depends(financial_db, scope="function"), user_id: int = Depends(get_current_user_id)):
    return operation_response(commands.add_contribution(goal_id=goal_id, data=data, db=db, user_id=user_id))
