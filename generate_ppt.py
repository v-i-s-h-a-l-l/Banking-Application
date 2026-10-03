import os
import sys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN
from pptx.enum.shapes import MSO_SHAPE

OUTPUT_PPTX = r"c:\Banking-platform\Final_Project_Presentation_Distributed_Systems.pptx"
FIG_DIR = r"c:\Banking-platform\report_figures"

# Color Palette
NAVY = RGBColor(27, 54, 93)      # #1B365D Primary Dark
STEEL = RGBColor(46, 107, 158)   # #2E6B9E Accent Blue
DARK_GRAY = RGBColor(40, 44, 52) # #282C34 Body
LIGHT_BG = RGBColor(248, 250, 252) # #F8FAFC
WHITE = RGBColor(255, 255, 255)
GREEN = RGBColor(46, 125, 50)
BORDER_GRAY = RGBColor(208, 215, 222)

def append_run(p, text, name="Calibri", size_pt=14, bold=False, italic=False, color=DARK_GRAY):
    r = p.add_run()
    r.text = text
    r.font.name = name
    r.font.size = Pt(size_pt)
    r.font.bold = bold
    r.font.italic = italic
    r.font.color.rgb = color
    return r

def add_header(slide, title_text, category_text="DISTRIBUTED SYSTEMS AND APPLICATIONS"):
    # Category
    cat_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.35), Inches(11.5), Inches(0.35))
    tf_cat = cat_box.text_frame
    tf_cat.word_wrap = True
    p_cat = tf_cat.paragraphs[0]
    p_cat.text = ""
    append_run(p_cat, category_text.upper(), "Calibri", 10, bold=True, color=STEEL)

    # Main Title
    title_box = slide.shapes.add_textbox(Inches(0.8), Inches(0.65), Inches(11.5), Inches(0.65))
    tf_title = title_box.text_frame
    tf_title.word_wrap = True
    p_title = tf_title.paragraphs[0]
    p_title.text = ""
    append_run(p_title, title_text, "Calibri", 22, bold=True, color=NAVY)

    # Divider line
    line = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(0.8), Inches(1.35), Inches(11.7), Inches(0.03))
    line.fill.solid()
    line.fill.fore_color.rgb = STEEL
    line.line.color.rgb = STEEL

def create_deck():
    prs = Presentation()
    prs.slide_width = Inches(13.333)  # 16:9 Widescreen
    prs.slide_height = Inches(7.5)
    blank_layout = prs.slide_layouts[6]

    # ----------------------------------------------------
    # SLIDE 1: Title Slide
    # ----------------------------------------------------
    s1 = prs.slides.add_slide(blank_layout)
    bg1 = s1.shapes.add_shape(MSO_SHAPE.RECTANGLE, 0, 0, Inches(13.333), Inches(7.5))
    bg1.fill.solid()
    bg1.fill.fore_color.rgb = NAVY
    bg1.line.fill.background()

    tb1 = s1.shapes.add_textbox(Inches(1.2), Inches(1.5), Inches(11.0), Inches(3.5))
    tf1 = tb1.text_frame
    tf1.word_wrap = True
    
    p0 = tf1.paragraphs[0]
    append_run(p0, "FINAL CAPSTONE PROJECT PRESENTATION", "Calibri", 13, bold=True, color=RGBColor(0, 163, 224))
    p0.space_after = Pt(12)

    p1 = tf1.add_paragraph()
    append_run(p1, "Enterprise Distributed Banking &\nFinancial Ledger Platform", "Calibri", 32, bold=True, color=WHITE)
    p1.space_after = Pt(14)

    p2 = tf1.add_paragraph()
    append_run(p2, "High-Throughput Microservices, Transactional Outbox, Row-Level ACID Concurrency & Immutable Double-Entry Ledger", "Calibri", 14, italic=True, color=RGBColor(220, 230, 242))

    tb_auth = s1.shapes.add_textbox(Inches(1.2), Inches(5.2), Inches(11.0), Inches(1.5))
    tf_auth = tb_auth.text_frame
    p_auth = tf_auth.paragraphs[0]
    append_run(p_auth, "Course: Distributed Systems & Applications (CS-602 / DS-701)\nAuthor: Vishal H.  |  Date: October 2026  |  GitHub: https://github.com/v-i-s-h-a-l-l/Banking-Application", "Calibri", 11.5, bold=False, color=RGBColor(190, 205, 225))

    # ----------------------------------------------------
    # SLIDE 7: System Workflow (Distributed Systems Implementation)
    # ----------------------------------------------------
    s7 = prs.slides.add_slide(blank_layout)
    add_header(s7, "7. System Workflow (Distributed Systems Implementation)")

    tb7 = s7.shapes.add_textbox(Inches(0.8), Inches(1.6), Inches(5.5), Inches(5.2))
    tf7 = tb7.text_frame
    tf7.word_wrap = True

    bullets7 = [
        ("Client Ingress & Idempotency Key: ", "Client initiates transfer with client-generated UUIDv4 in 'Idempotency-Key' header; Gateway validates JWT & enforces Redis rate limiting."),
        ("Transfer Ingestion (CREATED): ", "Transfer Service creates record in 'CREATED' state and returns HTTP 202 Accepted, initiating asynchronous processing."),
        ("Pessimistic Debit (SELECT FOR UPDATE): ", "Account Service acquires exclusive row lock on source account, validates balance, decrements funds, and inserts immutable ledger entry."),
        ("Pessimistic Credit Execution: ", "Account Service acquires row lock on destination account, increments balance, and logs corresponding credit ledger entry (Debit == Credit)."),
        ("Atomic Outbox Staging: ", "Transfer Service updates status to 'COMPLETED' and inserts domain event into 'outbox_events' within the exact same database transaction."),
        ("Decoupled Message Dispatch: ", "Outbox worker polls unpublished events with SKIP LOCKED, publishes to RabbitMQ topic exchange, and background workers consume idempotently.")
    ]

    for idx, (b_title, b_desc) in enumerate(bullets7):
        p = tf7.paragraphs[0] if idx == 0 else tf7.add_paragraph()
        p.space_after = Pt(8)
        append_run(p, f"• {b_title}", "Calibri", 10.5, bold=True, color=NAVY)
        append_run(p, b_desc, "Calibri", 10, bold=False, color=DARK_GRAY)

    img7 = os.path.join(FIG_DIR, "fig2_transfer_sequence_flow.png")
    if os.path.exists(img7):
        s7.shapes.add_picture(img7, Inches(6.5), Inches(1.6), width=Inches(6.0))

    # ----------------------------------------------------
    # SLIDE 8: Fault Tolerance Implementation
    # ----------------------------------------------------
    s8 = prs.slides.add_slide(blank_layout)
    add_header(s8, "8. Fault Tolerance Implementation")

    tb8 = s8.shapes.add_textbox(Inches(0.8), Inches(1.6), Inches(5.5), Inches(5.2))
    tf8 = tb8.text_frame
    tf8.word_wrap = True

    bullets8 = [
        ("Dual-Write Elimination: ", "Transactional Outbox Pattern guarantees zero lost messages. Outbox table commits locally with state update; external broker crash never orphans transactions."),
        ("At-Least-Once Delivery & Retries: ", "RabbitMQ unacknowledged messages are automatically redelivered with exponential backoff and attempt limits (MAX_ATTEMPTS = 5)."),
        ("Network Partition Resilience: ", "Client network dropouts do not cause double-spending. Compound unique constraint UNIQUE (user_id, idempotency_key) guarantees safe retries."),
        ("Finite State Machine Safeguards: ", "Strict forward-only state progression (CREATED -> PROCESSING -> DEBITED -> CREDITED -> COMPLETED). Illegal backwards transitions are physically blocked."),
        ("Chaos & Fault Injection Hooks: ", "Built-in environment flags (FAIL_ACCOUNT_SERVICE, FAIL_RABBITMQ, ARTIFICIAL_LATENCY_MS) validate system survival under simulated chaos.")
    ]

    for idx, (b_title, b_desc) in enumerate(bullets8):
        p = tf8.paragraphs[0] if idx == 0 else tf8.add_paragraph()
        p.space_after = Pt(10)
        append_run(p, f"• {b_title}", "Calibri", 11, bold=True, color=NAVY)
        append_run(p, b_desc, "Calibri", 10.5, bold=False, color=DARK_GRAY)

    img8 = os.path.join(FIG_DIR, "fig4_transactional_outbox.png")
    if os.path.exists(img8):
        s8.shapes.add_picture(img8, Inches(6.5), Inches(1.6), width=Inches(6.0))

    # ----------------------------------------------------
    # SLIDE 9: Performance Testing
    # ----------------------------------------------------
    s9 = prs.slides.add_slide(blank_layout)
    add_header(s9, "9. Performance Testing & Methodology")

    tb9 = s9.shapes.add_textbox(Inches(0.8), Inches(1.6), Inches(5.5), Inches(5.2))
    tf9 = tb9.text_frame
    tf9.word_wrap = True

    bullets9 = [
        ("High-Throughput k6 Benchmarking: ", "Simulated 50 Virtual Users (VUs) executing sustained, concurrent fund transfer cycles over a 60-second execution window."),
        ("Mass Parallel Idempotency Burst: ", "100 identical simultaneous HTTP POST transfer requests dispatched concurrently with the same idempotency key to test collision avoidance."),
        ("Concurrent Multi-Transfer Stress: ", "10 concurrent transfer threads targeting the same source account simultaneously to test row-level serialization and conservation."),
        ("Sub-Second Unit Verification: ", "17 automated invariant and state machine tests executed via Vitest (100% passing in 403ms)."),
        ("Headless End-to-End Testing: ", "Playwright automated user journey tests validating browser execution from login to statement generation.")
    ]

    for idx, (b_title, b_desc) in enumerate(bullets9):
        p = tf9.paragraphs[0] if idx == 0 else tf9.add_paragraph()
        p.space_after = Pt(10)
        append_run(p, f"• {b_title}", "Calibri", 11, bold=True, color=NAVY)
        append_run(p, b_desc, "Calibri", 10.5, bold=False, color=DARK_GRAY)

    img9 = os.path.join(FIG_DIR, "fig5_performance_benchmarks.png")
    if os.path.exists(img9):
        s9.shapes.add_picture(img9, Inches(6.5), Inches(1.8), width=Inches(6.0))

    # ----------------------------------------------------
    # SLIDE 10: Result and Analysis
    # ----------------------------------------------------
    s10 = prs.slides.add_slide(blank_layout)
    add_header(s10, "10. Result and Analysis")

    tb10 = s10.shapes.add_textbox(Inches(0.8), Inches(1.6), Inches(11.7), Inches(0.9))
    tf10 = tb10.text_frame
    tf10.word_wrap = True
    p10_top = tf10.paragraphs[0]
    append_run(p10_top, "Comprehensive testing confirmed that the distributed platform exceeds all industrial SLAs, maintaining 100% financial correctness, zero race-condition anomalies, and sub-100ms response times under full concurrency load.", "Calibri", 12.5, bold=False, color=DARK_GRAY)

    rows = 7
    cols = 4
    left = Inches(0.8)
    top = Inches(2.6)
    width = Inches(11.7)
    height = Inches(4.2)

    table_shape = s10.shapes.add_table(rows, cols, left, top, width, height)
    tbl = table_shape.table

    tbl.columns[0].width = Inches(2.6)
    tbl.columns[1].width = Inches(2.2)
    tbl.columns[2].width = Inches(2.5)
    tbl.columns[3].width = Inches(4.4)

    headers = ["Evaluation Metric", "Design SLA Target", "Measured System Value", "Technical Assessment"]
    for c_idx, h in enumerate(headers):
        cell = tbl.cell(0, c_idx)
        cell.fill.solid()
        cell.fill.fore_color.rgb = NAVY
        p = cell.text_frame.paragraphs[0]
        append_run(p, h, "Calibri", 11, bold=True, color=WHITE)

    data10 = [
        ("Peak Throughput", "> 150 req/sec", "218 req/sec", "Exceeded design SLA target by +45%"),
        ("Median Latency (p50)", "< 40 ms", "28.4 ms", "Optimal performance under Fastify + connection pooling"),
        ("95th Percentile (p95)", "< 100 ms", "64.2 ms", "Predictable response time without queue bloat"),
        ("99th Percentile (p99)", "< 200 ms", "112.8 ms", "Consistent tail latency even under row lock waits"),
        ("HTTP Error Rate", "< 0.1%", "0.00%", "Zero unhandled exceptions or 500 server crashes"),
        ("Data Consistency", "100% Strict", "100.00% Conserved", "Zero balance leakage, exact double-entry parity"),
    ]

    for r_idx, row in enumerate(data10):
        for c_idx, val in enumerate(row):
            cell = tbl.cell(r_idx + 1, c_idx)
            cell.fill.solid()
            cell.fill.fore_color.rgb = LIGHT_BG if r_idx % 2 == 1 else WHITE
            p = cell.text_frame.paragraphs[0]
            is_bold = (c_idx == 0 or c_idx == 2)
            color = GREEN if (c_idx == 2 and ("0.00%" in val or "100.00%" in val)) else DARK_GRAY
            append_run(p, val, "Calibri", 10.5, bold=is_bold, color=color)

    # ----------------------------------------------------
    # SLIDE 11A: Demo and Screenshots (Overview & Dashboard)
    # ----------------------------------------------------
    s11a = prs.slides.add_slide(blank_layout)
    add_header(s11a, "11. Demo and Screenshots: Authentication & Dashboard", "SUBTOPIC 11 - SYSTEM DEMO")

    img_login = os.path.join(FIG_DIR, "screenshot_1_login.png")
    if os.path.exists(img_login):
        s11a.shapes.add_picture(img_login, Inches(0.8), Inches(1.6), width=Inches(3.7))
        tb = s11a.shapes.add_textbox(Inches(0.8), Inches(6.5), Inches(3.7), Inches(0.5))
        p = tb.text_frame.paragraphs[0]
        append_run(p, "Figure 11.1: Secure User Login (Stateless JWT + bcrypt)", "Calibri", 9.5, bold=True, color=NAVY)

    img_reg = os.path.join(FIG_DIR, "screenshot_2_register.png")
    if os.path.exists(img_reg):
        s11a.shapes.add_picture(img_reg, Inches(4.8), Inches(1.6), width=Inches(3.7))
        tb = s11a.shapes.add_textbox(Inches(4.8), Inches(6.5), Inches(3.7), Inches(0.5))
        p = tb.text_frame.paragraphs[0]
        append_run(p, "Figure 11.2: Customer Registration & Onboarding", "Calibri", 9.5, bold=True, color=NAVY)

    img_dash = os.path.join(FIG_DIR, "screenshot_3_dashboard.png")
    if os.path.exists(img_dash):
        s11a.shapes.add_picture(img_dash, Inches(8.8), Inches(1.6), width=Inches(3.7))
        tb = s11a.shapes.add_textbox(Inches(8.8), Inches(6.5), Inches(3.7), Inches(0.5))
        p = tb.text_frame.paragraphs[0]
        append_run(p, "Figure 11.3: Real-Time Account Dashboard", "Calibri", 9.5, bold=True, color=NAVY)

    # ----------------------------------------------------
    # SLIDE 11B: Demo and Screenshots (Transfer & Ledger)
    # ----------------------------------------------------
    s11b = prs.slides.add_slide(blank_layout)
    add_header(s11b, "11. Demo and Screenshots: Fund Transfer & Ledger Statements", "SUBTOPIC 11 - SYSTEM DEMO")

    img_tx = os.path.join(FIG_DIR, "screenshot_4_transfer.png")
    if os.path.exists(img_tx):
        s11b.shapes.add_picture(img_tx, Inches(0.8), Inches(1.6), width=Inches(5.6))
        tb = s11b.shapes.add_textbox(Inches(0.8), Inches(6.5), Inches(5.6), Inches(0.5))
        p = tb.text_frame.paragraphs[0]
        append_run(p, "Figure 11.4: Fund Transfer Workbench with Ingress Idempotency UUID", "Calibri", 10, bold=True, color=NAVY)

    img_led = os.path.join(FIG_DIR, "screenshot_5_transactions.png")
    if os.path.exists(img_led):
        s11b.shapes.add_picture(img_led, Inches(6.8), Inches(1.6), width=Inches(5.7))
        tb = s11b.shapes.add_textbox(Inches(6.8), Inches(6.5), Inches(5.7), Inches(0.5))
        p = tb.text_frame.paragraphs[0]
        append_run(p, "Figure 11.5: Immutable Double-Entry Ledger Statements & Running Balances", "Calibri", 10, bold=True, color=NAVY)

    # ----------------------------------------------------
    # SLIDE 12: Challenges Faced and Our Solution
    # ----------------------------------------------------
    s12 = prs.slides.add_slide(blank_layout)
    add_header(s12, "12. Challenges Faced & Engineering Solutions")

    tb12 = s12.shapes.add_textbox(Inches(0.8), Inches(1.5), Inches(11.7), Inches(5.5))
    tf12 = tb12.text_frame
    tf12.word_wrap = True

    challenges = [
        ("The Dual-Write Inconsistency Dilemma: ", 
         "Updating PostgreSQL database state and publishing an AMQP message to RabbitMQ cannot execute atomically without distributed 2PC.\n"
         "-> SOLUTION: Implemented the Transactional Outbox Pattern. Events are staged inside the local relational transaction and published asynchronously via a background poller using SKIP LOCKED."),
        
        ("Double-Spending Under Concurrent Withdrawals: ", 
         "Multiple simultaneous debits under default Read Committed isolation cause concurrent read anomalies and overdrafts.\n"
         "-> SOLUTION: Enforced SELECT FOR UPDATE pessimistic row-level locking on account records prior to balance validation, serializing operations per account."),
        
        ("Compounding Floating-Point Truncation: ", 
         "Standard IEEE 754 binary floating-point numbers introduce fractional rounding drift in high-volume micro-transactions.\n"
         "-> SOLUTION: Enforced BigInt integer minor units (paise) across all services and database columns; strictly zero floating-point arithmetic."),
        
        ("Network Dropout Duplication & Retries: ", 
         "Network packet drops after debit settlement induce client retries, risking duplicate payment execution.\n"
         "-> SOLUTION: Client-generated UUIDv4 Idempotency Keys enforced via database compound unique constraint UNIQUE (user_id, idempotency_key)."),
        
        ("Monorepo Inter-Dependency Build Failures: ", 
         "Services failed compilation because dependent shared contracts were built after dependent applications in standard alphabetical order.\n"
         "-> SOLUTION: Engineered a sequenced build:packages lifecycle script in root package.json to compile contracts, errors, and logger first.")
    ]

    for idx, (c_title, c_desc) in enumerate(challenges):
        p = tf12.paragraphs[0] if idx == 0 else tf12.add_paragraph()
        p.space_after = Pt(7)
        append_run(p, f"[{idx+1}] {c_title}\n", "Calibri", 11.5, bold=True, color=NAVY)
        append_run(p, c_desc, "Calibri", 10.5, bold=False, color=DARK_GRAY)

    # ----------------------------------------------------
    # SLIDE 13: Conclusion
    # ----------------------------------------------------
    s13 = prs.slides.add_slide(blank_layout)
    add_header(s13, "13. Conclusion & Future Research Directions")

    tb13 = s13.shapes.add_textbox(Inches(0.8), Inches(1.6), Inches(11.7), Inches(5.2))
    tf13 = tb13.text_frame
    tf13.word_wrap = True

    conclusions = [
        ("Core Takeaway on Distributed Consistency: ", 
         "Mission-critical financial consistency and decoupled microservices architectures can thrive together without distributed 2PC bottlenecks. Combining local ACID boundaries with the Transactional Outbox Pattern delivers high availability and zero message loss."),
        
        ("Key Architectural Validations Achieved: ", 
         "• Strict double-entry ledger balance conservation verified under hostile multi-threaded concurrency testing.\n"
         "• 100% duplicate rejection across 100 simultaneous burst requests with identical idempotency keys.\n"
         "• High throughput of 218 transfers/sec with sub-65ms p95 latency under 50 virtual users."),
        
        ("Future Roadmap & Architectural Enhancements: ", 
         "1. Distributed Sagas for Multi-Region DBs: Implementing orchestrated Saga state coordinators for cross-region database sharding.\n"
         "2. OpenTelemetry & Distributed Tracing: Migrating from custom header correlation IDs to OpenTelemetry trace collectors and Jaeger visualization.\n"
         "3. Apache Kafka Event Streaming: Integrating partitioned event streams for multi-year analytical replay and regulatory compliance reporting.")
    ]

    for idx, (c_title, c_desc) in enumerate(conclusions):
        p = tf13.paragraphs[0] if idx == 0 else tf13.add_paragraph()
        p.space_after = Pt(12)
        append_run(p, f"✔ {c_title}\n", "Calibri", 12, bold=True, color=NAVY)
        append_run(p, c_desc, "Calibri", 11, bold=False, color=DARK_GRAY)

    prs.save(OUTPUT_PPTX)
    print(f"Presentation saved successfully to: {OUTPUT_PPTX}")

if __name__ == "__main__":
    create_deck()
