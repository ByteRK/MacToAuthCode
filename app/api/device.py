import json

from flask import Blueprint, current_app, jsonify, request


device_bp = Blueprint("device", __name__)
requestNum = 0


def apply_device_cors(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    response.headers["Access-Control-Max-Age"] = "86400"
    return response


@device_bp.after_request
def add_device_cors_headers(response):
    return apply_device_cors(response)


@device_bp.route("/api/device/authorize", methods=["OPTIONS"])
def authorize_device_options():
    return apply_device_cors(current_app.response_class(status=204))


def debug_log(message: str) -> None:
    print(message.encode("gbk", errors="ignore").decode("gbk"), flush=True)

@device_bp.post("/api/device/authorize")
def authorize_device():
    debug_log("\n" + "=" * 60)
    global requestNum
    requestNum += 1
    debug_log(f"第 {requestNum} 次请求")
    debug_log("请求信息:")
    debug_log(f"  Method: {request.method}")
    debug_log(f"  URL: {request.url}")
    debug_log(f"  Endpoint: {request.endpoint}")
    debug_log(f"  Remote Addr: {request.remote_addr}")
    debug_log(f"  User Agent: {request.user_agent}")
    debug_log("\nHeaders:")
    for key, value in request.headers:
        debug_log(f"  {key}: {value}")
    debug_log("\nQuery Params:")
    for key, value in request.args.items():
        debug_log(f"  {key}: {value}")
    debug_log("\nCookies:")
    for key, value in request.cookies.items():
        debug_log(f"  {key}: {value}")
    debug_log("\nBody:")
    debug_log(f"  Raw: {request.get_data(as_text=True)[:500]}")
    debug_log(f"  JSON: {request.get_json(silent=True)}")
    debug_log("=" * 60)
    
    # 根据 Content-Type 智能解析请求体
    content_type = request.content_type or ""
    payload = {}
    
    if "application/json" in content_type:
        # JSON 格式
        payload = request.get_json(silent=True) or {}
        debug_log("解析方式: JSON")
        
    elif "application/x-www-form-urlencoded" in content_type:
        # 表单格式
        payload = request.form.to_dict()
        debug_log("解析方式: x-www-form-urlencoded")
        
    elif "multipart/form-data" in content_type:
        # 文件上传格式
        payload = request.form.to_dict()
        # 如果有文件，单独处理
        if request.files:
            payload["_files"] = [f for f in request.files.keys()]
        debug_log("解析方式: multipart/form-data")
        
    else:
        # 其他格式，尝试解析为查询字符串或原始数据
        if request.args:
            payload = request.args.to_dict()
            debug_log("解析方式: query string")
        else:
            payload = {"raw_data": request.get_data(as_text=True)}
            debug_log("解析方式: raw data")
    debug_log(f"payload: {payload}")
    debug_log("=" * 60 + "\n")
    
    client_ip = request.remote_addr
    request_access_policy_service = current_app.extensions["request_access_policy_service"]
    if not request_access_policy_service.is_allowed(client_ip):
        repository = current_app.extensions["auth_code_repository"]
        pid = str(payload.get("pid", "")).strip() or "-"
        mac = str(payload.get("mac", "")).strip() or "-"
        payload_json = json.dumps(payload, ensure_ascii=False, sort_keys=True) if payload else None
        with repository.database.connection() as conn:
            repository.log_distribution(
                conn,
                pid=pid,
                mac=mac,
                action="denied",
                message="请求 IP 不在白名单内",
                client_ip=client_ip,
                payload_json=payload_json,
            )
        debug_log("请求 IP 不在白名单内")
        return jsonify({"success": False, "message": "当前请求 IP 不在白名单内"}), 403

    mac = str(payload.get("mac", "")).strip()
    pid = str(payload.get("pid", "")).strip()
    if not mac:
        debug_log("请求体缺少 mac 字段")
        return jsonify({"success": False, "message": "请求体缺少 mac 字段"}), 400
    if not pid:
        debug_log("请求体缺少 pid 字段")
        return jsonify({"success": False, "message": "请求体缺少 pid 字段"}), 400

    service = current_app.extensions["auth_code_service"]
    try:
        body, status = service.distribute_code(mac, pid, client_ip)
    except ValueError as exc:
        debug_log(f"授权失败: {exc}")
        return jsonify({"success": False, "message": str(exc)}), 400

    debug_log(f"授权结果: {status} {body}")
    return jsonify(body), status
