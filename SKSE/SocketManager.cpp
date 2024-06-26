#include <nlohmann/json.hpp>
#include <string>
#include <websocketpp/client.hpp>
#include <websocketpp/config/asio_no_tls_client.hpp>

using namespace std;

// pull out the type of messages sent by our config
typedef websocketpp::config::asio_client::message_type::ptr message_ptr;
using json = nlohmann::json;
typedef websocketpp::client<websocketpp::config::asio_client> client;

using websocketpp::lib::bind;
using websocketpp::lib::placeholders::_1;
using websocketpp::lib::placeholders::_2;


class Message {
public:
    Message(const string& type, const string& message, const string& id,
            const string& location = "",
            const string& currentDateTime = "")
        : type(type), message(message), id(id), location(location), currentDateTime(currentDateTime) {}

    json toJson() const {
        return {{"type", type},
                {"message", message},
                {"id", id},
                {"is_n2n", false},
                {"location", location},
                {"currentDateTime", currentDateTime}
        };
    }

private:
    string type;
    string message;
    string id;
    string location;
    string currentDateTime;
};

class N2NMessage {
public:
    N2NMessage(const string& type, const string& message, const string& source, const string& target, int speaker,
               const string& location, const string& currentDateTime = "")
        : type(type),
          message(message),
          source(source),
          target(target),
          speaker(speaker),
          location(location),
          currentDateTime(currentDateTime) {}

    json toJson() const {
        return {{"type", type},     
                {"message", message}, 
                {"is_n2n", true},      
                {"source", source},     
                {"target", target},           
                {"speaker", speaker},
                {"location", location},
                {"currentDateTime", currentDateTime}};
    }

private:
    string type;
    string message;
    string source;
    string target;
    int speaker;
    string location;
    string currentDateTime;
};

class InworldSocketController {

public:
    client::connection_ptr con;
    client c;
    RE::Actor* conversationActor;

    InworldSocketController() {
        // Set up the connection parameters
        std::string uri = "ws://127.0.0.1:" + std::to_string(getClientPort()) + "/chat";

        try {
            // set logging policy if needed
            c.clear_access_channels(websocketpp::log::alevel::frame_header);
            c.clear_access_channels(websocketpp::log::alevel::frame_payload);

            c.init_asio();

            c.set_message_handler(bind(&on_message, &c, ::_1, ::_2));

            websocketpp::lib::error_code ec;
            con = c.get_connection(uri, ec);
            c.connect(con);

            this->start_connection();
        } catch (const std::exception& e) {
            std::cout << e.what() << std::endl;
        } catch (websocketpp::lib::error_code e) {
            std::cout << e.message() << std::endl;
        } catch (...) {
            std::cout << "other exception" << std::endl;
        }
    }

    static InworldSocketController* GetSingleton() {
        static InworldSocketController singleton;
        return &singleton;
    }

    int getClientPort() {
        auto mainPath = std::filesystem::current_path();
        auto clientPath = mainPath / "Inworld" / ".env";
        std::ifstream envFile(clientPath);  // Open the environment file for reading
        std::string line;
        int clientPort = 3000;  // Default value if CLIENT_PORT is not found
        while (std::getline(envFile, line)) {                         // Read each line in the file
            if (line.contains("CLIENT_PORT")) {     // Check if the line contains the desired variable
                std::size_t pos = line.find("=");                     // find position of equals sign
                std::string port = line.substr(pos + 1);  // extract substring after equals sign
                clientPort = std::stoi(port);                         // Convert the value to an int
                break;  // Stop reading the file once the variable is found
            }
        }
        envFile.close();  // Close the file
        return clientPort;
    }

    void start_connection() {
        std::thread ws_thread(&InworldSocketController::run, this);
        ws_thread.detach();
    }

    void run() {
        // The WebSocket server connection will be started in a separate thread
        c.run();
    }

    void send_message(Message* message) {
        // Send a JSON message to the server
        json messageJson = message->toJson();
        std::string message_str = messageJson.dump();
        c.send(con->get_handle(), message_str, websocketpp::frame::opcode::text);
    }

    void send_message_n2n(N2NMessage* message) {
        json messageJson = message->toJson();
        std::string message_str = messageJson.dump();
        c.send(con->get_handle(), message_str, websocketpp::frame::opcode::text);
    }

    static void on_message(client* c, websocketpp::connection_hdl hdl, message_ptr msg) {
        try {
            json j = json::parse(msg->get_payload());

            std::string message = j["message"];
            std::string phoneme = j["phoneme"];
            std::string type = j["type"];
            bool is_n2n = j["is_n2n"];
            int speaker = j["speaker"];
            float duration = j["duration"];

            if (type == "established" && !is_n2n) {
                InworldCaller::ShowReplyMessage("NPC is listening...");
                InworldCaller::ConnectionSuccessful();
            } else if (type == "established" && is_n2n) {
                InworldCaller::n2n_established_response_count++;
                if (InworldCaller::n2n_established_response_count == 3)
                    InworldCaller::N2N_Init();
            } else if (type == "chat" && !is_n2n) {
                InworldCaller::Speak(message, duration);
            } else if (type == "chat" && is_n2n) {
                InworldCaller::SpeakN2N(message, speaker, duration);
            } else if (type == "end" && !is_n2n) {
                InworldCaller::Stop();
            } else if (type == "follow_request_accepted" && !is_n2n) {
                InworldCaller::SendFollowRequestAcceptedSignal();
            } else if (type == "end" && is_n2n) {
                InworldCaller::N2N_Stop();
            } else if (type == "doesntexist" && !is_n2n) {
                InworldCaller::ShowReplyMessage(message);
                InworldCaller::conversationActor = nullptr;
                InworldCaller::conversationPair = nullptr;
            } else if (type == "doesntexist" && is_n2n) {
                InworldCaller::ShowReplyMessage(message);
                InworldCaller::N2N_SourceActor = nullptr;
                InworldCaller::N2N_TargetActor = nullptr;
            }
        } 
        catch (...) 
        {
        }
    }
};

class SocketManager {
private:
    InworldSocketController* soc;
    const char* lastConnected;
    SocketManager() {}

    SocketManager(const SocketManager&) = delete;
    SocketManager& operator=(const SocketManager&) = delete;

public:
    static SocketManager& getInstance() {
        static SocketManager instance;
        return instance;
    }

    void initSocket() { 
        soc = new InworldSocketController();
    }

    void sendMessage(std::string message, RE::Actor* conversationActor) {
        auto id = conversationActor->GetName();

        if (lastConnected != id) {
            lastConnected = id;
            Message* messageObj = new Message("connect", "connect request..", id, "");
            soc->send_message(messageObj);
        }

        Message* messageObj = new Message("message", message, id, "");
        soc->send_message(messageObj);
    }

    void SendStopSignal(RE::Actor* conversationActor) {
        ValidateSocket();
        auto id = conversationActor->GetName();
        if (id == nullptr || id == "") return;
        Message* message = new Message("stop", "stop", id);
        soc->send_message(message);
    }

    void SendLogEvent(RE::Actor* actor, string log) { 
        ValidateSocket();
        auto id = actor->GetName();
        if (id == nullptr || id == "") return;
        Message* message = new Message("log_event", log, id);
        soc->send_message(message);
    }

    void SendN2NStartSignal(RE::Actor* source, RE::Actor* target, string currentDateTime) {
        N2NMessage* message = new N2NMessage("start", "", source->GetName(), target->GetName(), 0,
                           source->GetCurrentLocation()->GetName(), currentDateTime);
        soc->send_message_n2n(message);
    }

    void SendN2NStopSignal() {
        N2NMessage* message = new N2NMessage("stop", "", "", "", 0, "");
        soc->send_message_n2n(message);
    }

    void ValidateSocket() { 
        if (soc == nullptr || soc->con == nullptr) {
            soc = new InworldSocketController();
        }
    }

    void controlVoiceInput(bool talk, RE::Actor* conversationActor) {
        try {
            ValidateSocket();
            auto id = conversationActor->GetName();
            
            if (id == nullptr || id == "") return;
            if (lastConnected != id) return;
            InworldCaller::conversationActor = conversationActor;
            Message* message;
            if (talk) 
                 message = new Message("start_listen", "start", lastConnected);
            else
                message = new Message("stop_listen", "stop", lastConnected);
            soc->send_message(message);
        } catch (...) {
            // Ignore
        }
    }

    void connectTo(RE::Actor* conversationActor, string currentDateTime) {
        ValidateSocket();
        auto id = conversationActor->GetName();
        auto location = conversationActor->GetCurrentLocation()->GetName();
        if (id == nullptr || id == "") return;
        InworldCaller::conversationActor = conversationActor;
        lastConnected = id;
        Message* message = new Message("connect", "connect request..", id, location, currentDateTime);
        soc->send_message(message);
    }

    void connectTo_N2N(RE::Actor* sourceActor, RE::Actor* targetActor) {
        ValidateSocket();
        auto source_id = sourceActor->GetName();
        auto target_id = targetActor->GetName();
        if (source_id == nullptr || source_id == "" || target_id == nullptr || target_id == "") return;
        InworldCaller::N2N_SourceActor = sourceActor;
        InworldCaller::N2N_TargetActor = targetActor;
        N2NMessage* message = new N2NMessage("connect", "connect", source_id, target_id, 0,"");
        soc->send_message_n2n(message);
    }
};