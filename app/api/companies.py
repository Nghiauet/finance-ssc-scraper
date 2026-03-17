from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.database import get_db
from app.models import Company, Document
from app.schemas.company import CompanyCreate, CompanyUpdate, CompanyResponse
from app.schemas.document import DocumentResponse

router = APIRouter(prefix="/companies", tags=["companies"])


@router.get("", response_model=list[CompanyResponse])
def list_companies(
    search: str = Query("", description="Search by symbol or name"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(Company, func.count(Document.id).label("doc_count"))
        .outerjoin(Document, Document.company_id == Company.id)
        .group_by(Company.id)
    )
    if search:
        rows = rows.filter(
            Company.symbol.ilike(f"%{search}%") | Company.name.ilike(f"%{search}%")
        )
    rows = rows.order_by(Company.symbol).offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for c, doc_count in rows:
        resp = CompanyResponse.model_validate(c)
        resp.document_count = doc_count
        result.append(resp)
    return result


@router.get("/count")
def count_companies(db: Session = Depends(get_db)):
    return {"count": db.query(func.count(Company.id)).scalar()}


@router.get("/{company_id}", response_model=CompanyResponse)
def get_company(company_id: str, db: Session = Depends(get_db)):
    company = db.query(Company).get(company_id)
    if not company:
        raise HTTPException(404, "Company not found")
    doc_count = db.query(func.count(Document.id)).filter_by(company_id=company.id).scalar()
    resp = CompanyResponse.model_validate(company)
    resp.document_count = doc_count
    return resp


@router.post("", response_model=CompanyResponse, status_code=201)
def create_company(data: CompanyCreate, db: Session = Depends(get_db)):
    existing = db.query(Company).filter_by(symbol=data.symbol.upper()).first()
    if existing:
        raise HTTPException(409, f"Company with symbol {data.symbol} already exists")

    company = Company(
        symbol=data.symbol.upper(),
        name=data.name,
        exchange=data.exchange,
        metadata_=data.metadata_,
    )
    db.add(company)
    db.commit()
    db.refresh(company)
    resp = CompanyResponse.model_validate(company)
    resp.document_count = 0
    return resp


@router.put("/{company_id}", response_model=CompanyResponse)
def update_company(company_id: str, data: CompanyUpdate, db: Session = Depends(get_db)):
    company = db.query(Company).get(company_id)
    if not company:
        raise HTTPException(404, "Company not found")

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(company, field, value)
    db.commit()
    db.refresh(company)
    doc_count = db.query(func.count(Document.id)).filter_by(company_id=company.id).scalar()
    resp = CompanyResponse.model_validate(company)
    resp.document_count = doc_count
    return resp


@router.delete("/{company_id}")
def delete_company(company_id: str, db: Session = Depends(get_db)):
    company = db.query(Company).get(company_id)
    if not company:
        raise HTTPException(404, "Company not found")
    db.delete(company)
    db.commit()
    return {"ok": True}


@router.get("/{company_id}/documents", response_model=list[DocumentResponse])
def list_company_documents(
    company_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
):
    company = db.query(Company).get(company_id)
    if not company:
        raise HTTPException(404, "Company not found")
    docs = (
        db.query(Document)
        .filter_by(company_id=company_id)
        .order_by(Document.submission_date.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    return [DocumentResponse.model_validate(d) for d in docs]
