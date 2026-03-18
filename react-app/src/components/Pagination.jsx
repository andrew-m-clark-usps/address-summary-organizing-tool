import React from 'react';

const PAGE_SIZE = 50;

export default function Pagination({ currentPage, totalItems, onPage }) {
    const totalPages = Math.max(1, Math.ceil(totalItems / PAGE_SIZE));
    const maxBtns = 7;
    let start = Math.max(1, currentPage - 3);
    let end = Math.min(totalPages, start + maxBtns - 1);
    start = Math.max(1, end - maxBtns + 1);

    return (
        <div className="pagination">
            <span>Page {currentPage} of {totalPages}</span>
            <div className="pagination-controls">
                <button
                    className="page-btn"
                    disabled={currentPage === 1}
                    onClick={() => onPage(currentPage - 1)}
                >‹</button>
                {Array.from({ length: end - start + 1 }, (_, i) => start + i).map(p => (
                    <button
                        key={p}
                        className={`page-btn ${p === currentPage ? 'active' : ''}`}
                        onClick={() => onPage(p)}
                    >{p}</button>
                ))}
                <button
                    className="page-btn"
                    disabled={currentPage === totalPages}
                    onClick={() => onPage(currentPage + 1)}
                >›</button>
            </div>
        </div>
    );
}

export { PAGE_SIZE };
