use actix::prelude::*;
use actix_web::*;
use actors::{ForwardA2AMsg, GetEndpoint, HandleAdminMessage};
use actors::forward_agent::ForwardAgent;
use actors::admin::Admin;
use bytes::Bytes;
use domain::config::AppConfig;
use futures::*;
use domain::admin_message::{AdminQuery, GetDetailAgentParams, GetDetailAgentConnParams};

const MAX_PAYLOAD_SIZE: usize = 105_906_176;

pub struct AppState {
    pub forward_agent: Addr<ForwardAgent>,
    pub admin_agent: Addr<Admin>,
}

#[derive(Deserialize)]
struct AgentParams {
    did: String,
}

pub fn new(config: AppConfig, forward_agent: Addr<ForwardAgent>, admin_agent: Addr<Admin>) -> App<AppState> {
    let app = App::with_state(AppState { admin_agent, forward_agent })
        .prefix(config.prefix)
        .middleware(middleware::Logger::default()) // enable logger
        .resource("", |r| r.method(http::Method::GET).with(_get_endpoint_details))
        .resource("/msg", |r| r.method(http::Method::POST).with(_forward_message));
    match config.enable_admin_api {
        Some(enable_admin_api) if enable_admin_api => {
            app.resource("/admin", |r| r.method(http::Method::GET).with(_get_actor_overview))
                .resource("/admin/forward-agent", |r| r.method(http::Method::GET).with(_get_forward_agent_details))
                .route("/admin/agent/{did}", http::Method::GET, _get_agent_details)
                .route("/admin/agent-connection/{did}", http::Method::GET, _get_agent_connection_details)
        }
        _ => app
    }
}

fn _send_admin_message(state: State<AppState>, admin_msg: HandleAdminMessage) -> FutureResponse<HttpResponse> {
    state.admin_agent
        .send(admin_msg)
        .from_err()
        .map(|res| match res {
            Ok(agent_details) => HttpResponse::Ok().json(&agent_details),
            Err(err) => HttpResponse::InternalServerError().body(format!("{:?}", err)).into(), // FIXME: Better error
        })
        .responder()
}

fn _get_agent_connection_details(state: State<AppState>, info: Path<AgentParams>) -> FutureResponse<HttpResponse> {
    let msg = HandleAdminMessage(AdminQuery::GetDetailAgentConnection(GetDetailAgentConnParams { agent_pairwise_did: info.did.clone() }));
    _send_admin_message(state, msg)
}

fn _get_agent_details(state: State<AppState>, info: Path<AgentParams>) -> FutureResponse<HttpResponse> {
    let msg = HandleAdminMessage(AdminQuery::GetDetailAgent(GetDetailAgentParams { agent_did: info.did.clone() }));
    _send_admin_message(state, msg)
}

fn _get_actor_overview(state: State<AppState>) -> FutureResponse<HttpResponse> {
    let msg = HandleAdminMessage(AdminQuery::GetActorOverview);
    _send_admin_message(state, msg)
}

fn _get_forward_agent_details(state: State<AppState>) -> FutureResponse<HttpResponse> {
    let msg = HandleAdminMessage(AdminQuery::GetDetailForwardAgents);
    _send_admin_message(state, msg)
}

fn _get_router_data(state: State<AppState>) -> FutureResponse<HttpResponse> {
    let msg = HandleAdminMessage(AdminQuery::GetDetailRouter);
    _send_admin_message(state, msg)
}

fn _get_endpoint_details(state: State<AppState>) -> FutureResponse<HttpResponse> {
    state.forward_agent
        .send(GetEndpoint {})
        .from_err()
        .map(|res| match res {
            Ok(endpoint) => HttpResponse::Ok().json(&endpoint),
            Err(err) => HttpResponse::InternalServerError().body(format!("{:?}", err)).into(), // FIXME: Better error
        })
        .responder()
}

fn _forward_message((state, req): (State<AppState>, HttpRequest<AppState>)) -> FutureResponse<HttpResponse> {
    req
        .body()
        .limit(MAX_PAYLOAD_SIZE)
        .from_err()
        .and_then(move |body| {
            state.forward_agent
                .send(ForwardA2AMsg(body.to_vec()))
                .from_err()
                .and_then(|res| match res {
                    Ok(msg) => Ok(Bytes::from(msg).into()),
                    Err(err) => Ok(HttpResponse::InternalServerError().body(format!("{:?}", err)).into()), // FIXME: Better error
                })
        })
        .responder()
}


