from functools import wraps

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


admin_bp = Blueprint("admin", __name__)


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
    data = dashboard_service.get_codes(
        status=status,
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
