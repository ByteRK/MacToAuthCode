from functools import wraps
from datetime import datetime

from flask import (
    Blueprint,
    current_app,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
)

from app.services.excel_service import ImportValidationError


admin_bp = Blueprint("admin", __name__)


def _normalize_log_export_datetime(value: str, *, is_end: bool) -> str:
    raw = value.strip()
    if not raw:
        return ""

    for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S"):
        try:
            parsed = datetime.strptime(raw, fmt)
            return parsed.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue

    for fmt in ("%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M"):
        try:
            parsed = datetime.strptime(raw, fmt)
            seconds = 59 if is_end else 0
            normalized = parsed.replace(second=seconds)
            return normalized.strftime("%Y-%m-%d %H:%M:%S")
        except ValueError:
            continue

    raise ValueError("时间范围格式不正确，请使用有效的日期时间")


def admin_login_required(view):
    @wraps(view)
    def wrapped_view(*args, **kwargs):
        if not session.get("is_admin"):
            if request.path.startswith("/api/"):
                return jsonify({"success": False, "message": "未登录或登录已失效"}), 401
            return redirect(url_for("admin.login"))
        return view(*args, **kwargs)

    return wrapped_view


@admin_bp.get("/")
def index():
    if session.get("is_admin"):
        return redirect(url_for("admin.dashboard"))
    return redirect(url_for("admin.login"))


@admin_bp.route("/login", methods=["GET", "POST"])
def login():
    settings = current_app.config["SETTINGS"]
    error = ""
    if request.method == "POST":
        username = request.form.get("username", "").strip()
        password = request.form.get("password", "")
        if username == settings.admin_username and password == settings.admin_password:
            session["is_admin"] = True
            session["admin_username"] = username
            return redirect(url_for("admin.dashboard"))
        error = "用户名或密码错误"
    return render_template("login.html", title=settings.app_name, error=error)


@admin_bp.get("/logout")
def logout():
    session.clear()
    return redirect(url_for("admin.login"))


@admin_bp.get("/dashboard")
@admin_login_required
def dashboard():
    settings = current_app.config["SETTINGS"]
    return render_template(
        "dashboard.html",
        title=settings.app_name,
        admin_username=session.get("admin_username", settings.admin_username),
    )


@admin_bp.get("/healthz")
def healthz():
    return jsonify({"success": True, "message": "ok"})


@admin_bp.get("/api/admin/overview")
@admin_login_required
def overview():
    dashboard_service = current_app.extensions["dashboard_service"]
    return jsonify({"success": True, "data": dashboard_service.get_overview()})


@admin_bp.get("/api/admin/logs")
@admin_login_required
def logs():
    dashboard_service = current_app.extensions["dashboard_service"]
    limit = min(max(int(request.args.get("limit", "20")), 5), 100)
    action = request.args.get("action", "all").strip()
    search = request.args.get("search", "").strip()
    data = dashboard_service.get_recent_logs(limit=limit, action=action, search=search)
    return jsonify(
        {
            "success": True,
            "data": {"items": data, "limit": limit, "action": action, "search": search},
        }
    )


@admin_bp.get("/api/admin/allocations")
@admin_login_required
def allocations():
    dashboard_service = current_app.extensions["dashboard_service"]
    page = max(int(request.args.get("page", "1")), 1)
    page_size = min(max(int(request.args.get("page_size", "20")), 1), 100)
    search = request.args.get("search", "").strip()
    data = dashboard_service.get_allocations(
        search=search,
        page=page,
        page_size=page_size,
    )
    return jsonify({"success": True, "data": data})


@admin_bp.get("/api/admin/codes")
@admin_login_required
def codes():
    dashboard_service = current_app.extensions["dashboard_service"]
    page = max(int(request.args.get("page", "1")), 1)
    page_size = min(max(int(request.args.get("page_size", "20")), 1), 100)
    search = request.args.get("search", "").strip()
    status = request.args.get("status", "all").strip()
    pid = request.args.get("pid", "").strip()
    if pid:
        data = dashboard_service.get_codes_by_pid(
            pid=pid,
            status=status,
            search=search,
            page=page,
            page_size=page_size,
        )
    else:
        data = dashboard_service.get_codes(
            status=status,
            search=search,
            page=page,
            page_size=page_size,
        )
    return jsonify({"success": True, "data": data})


@admin_bp.get("/api/admin/inventory-summary")
@admin_login_required
def inventory_summary():
    dashboard_service = current_app.extensions["dashboard_service"]
    page = max(int(request.args.get("page", "1")), 1)
    page_size = min(max(int(request.args.get("page_size", "20")), 1), 100)
    search = request.args.get("search", "").strip()
    data = dashboard_service.get_inventory_summary(
        search=search,
        page=page,
        page_size=page_size,
    )
    return jsonify({"success": True, "data": data})


@admin_bp.post("/api/admin/import-codes")
@admin_login_required
def import_codes():
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return jsonify({"success": False, "message": "请选择要导入的 Excel 文件"}), 400

    default_pid = request.form.get("default_pid", "").strip() or None
    excel_service = current_app.extensions["excel_service"]
    try:
        result = excel_service.import_codes(upload.stream, default_pid=default_pid)
    except ImportValidationError as exc:
        return jsonify(
            {
                "success": False,
                "message": str(exc),
                "errors": exc.errors,
            }
        ), 400
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400

    return jsonify(
        {
            "success": True,
            "message": "导入完成",
            "data": result,
        }
    )


@admin_bp.get("/api/admin/export-allocations")
@admin_login_required
def export_allocations():
    excel_service = current_app.extensions["excel_service"]
    stream = excel_service.build_allocations_workbook()
    return send_file(
        stream,
        as_attachment=True,
        download_name="assigned-auth-codes.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@admin_bp.get("/api/admin/export-logs")
@admin_login_required
def export_logs():
    excel_service = current_app.extensions["excel_service"]
    action = request.args.get("action", "all").strip()
    search = request.args.get("search", "").strip()
    raw_start_at = request.args.get("start_at", "").strip()
    raw_end_at = request.args.get("end_at", "").strip()
    try:
        start_at = _normalize_log_export_datetime(raw_start_at, is_end=False)
        end_at = _normalize_log_export_datetime(raw_end_at, is_end=True)
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400
    if start_at and end_at and start_at > end_at:
        return jsonify({"success": False, "message": "开始时间不能晚于结束时间"}), 400

    stream = excel_service.build_logs_workbook(
        action=action,
        search=search,
        start_at=start_at,
        end_at=end_at,
    )
    suffix = action if action in {"assigned", "reused", "exhausted", "denied"} else "all"
    return send_file(
        stream,
        as_attachment=True,
        download_name=f"request-logs-{suffix}.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )


@admin_bp.get("/api/admin/request-ip-whitelist")
@admin_login_required
def request_ip_whitelist():
    configuration_service = current_app.extensions["configuration_service"]
    return jsonify(
        {
            "success": True,
            "data": configuration_service.get_request_ip_whitelist_config(),
        }
    )


@admin_bp.post("/api/admin/request-ip-whitelist")
@admin_login_required
def update_request_ip_whitelist():
    payload = request.get_json(silent=True) or {}
    enabled = bool(payload.get("enabled", False))
    allowed_ips = payload.get("allowed_ips", [])
    if not isinstance(allowed_ips, list):
        return jsonify({"success": False, "message": "allowed_ips 必须是数组"}), 400

    configuration_service = current_app.extensions["configuration_service"]
    try:
        data = configuration_service.update_request_ip_whitelist_config(
            enabled=enabled,
            allowed_ips=[str(item) for item in allowed_ips],
        )
    except ValueError as exc:
        return jsonify({"success": False, "message": str(exc)}), 400

    return jsonify({"success": True, "message": "白名单配置已更新", "data": data})


@admin_bp.get("/api/admin/export-template")
@admin_login_required
def export_template():
    excel_service = current_app.extensions["excel_service"]
    stream = excel_service.build_import_template()
    return send_file(
        stream,
        as_attachment=True,
        download_name="auth-codes-template.xlsx",
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )
