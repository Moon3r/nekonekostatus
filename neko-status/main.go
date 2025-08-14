package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"time"

	"neko-status/stat"

	"github.com/gorilla/websocket"
	"gopkg.in/yaml.v2"
)

var (
	Config CONF
)

func main() {
	var confpath string
	var show_version bool
	flag.StringVar(&confpath, "c", "", "config path")
	flag.IntVar(&Config.Interval, "i", 1000, "refresh time ms")
	flag.StringVar(&Config.Host, "h", "127.0.0.1", "host")
	flag.IntVar(&Config.Port, "p", 55555, "port")
	flag.StringVar(&Config.Key, "key", "", "access key")
	flag.StringVar(&Config.Sid, "s", "", "host sid")
	flag.BoolVar(&Config.Ssl, "d", false, "SSL mode")
	flag.BoolVar(&show_version, "v", false, "show version")
	flag.Parse()

	if confpath != "" {
		data, err := ioutil.ReadFile(confpath)
		if err != nil {
			log.Fatalf("Error reading config file: %v", err) // 使用 log.Fatalf 替代 panic
		}
		err = yaml.Unmarshal([]byte(data), &Config)
		if err != nil {
			log.Fatalf("Error unmarshalling config YAML: %v", err) // 使用 log.Fatalf 替代 panic
		}
	}
	if show_version {
		fmt.Println("neko-status v1.0")
		return
	}

	// 启动核心的提交状态逻辑
	submitStat()
}

// submitStat 实现了带有自动重连功能的状态提交逻辑
func submitStat() {
	// --- 配置区 ---
	initialBackoff := 2 * time.Second // 初始重连延迟
	maxBackoff := 30 * time.Second    // 最大重连延迟
	currentBackoff := initialBackoff

	// 1. 准备连接信息 (只需准备一次)
	protocol := "ws"
	if Config.Ssl {
		protocol = "wss"
	}
	wsurl := url.URL{Scheme: protocol, Host: fmt.Sprintf("%s:%d", Config.Host, Config.Port), Path: "/stats/agent"}
	log.Printf("Target WebSocket URL: %s", wsurl.String())

	dialer := websocket.Dialer{}
	header := http.Header{}
	header.Add("key", Config.Key)
	header.Add("sid", Config.Sid)

	// 2. 外层循环：负责连接和重连
	for {
		log.Println("Attempting to connect to WebSocket...")
		connect, _, err := dialer.Dial(wsurl.String(), header)
		if err != nil {
			log.Printf("Connection failed: %v. Retrying in %v...", err, currentBackoff)
			time.Sleep(currentBackoff)
			// 指数增加退避时间
			currentBackoff *= 2
			if currentBackoff > maxBackoff {
				currentBackoff = maxBackoff
			}
			continue // 继续下一次重连尝试
		}

		// 连接成功
		log.Println("WebSocket connected successfully.")
		currentBackoff = initialBackoff // 重置退避时间
		defer connect.Close()           // 确保当这个循环迭代结束时（即连接断开时）关闭连接

		// 3. 内层循环：负责在已连接状态下发送数据
		for {
			statx, err := stat.GetStat()
			if err != nil {
				log.Printf("Error getting stats: %v", err)
				// 根据需要决定是否因为获取状态失败而断开连接，这里选择继续
				time.Sleep(time.Millisecond * time.Duration(Config.Interval))
				continue
			}

			data, err := json.Marshal(statx)
			if err != nil {
				log.Printf("Error marshalling stats to JSON: %v", err)
				continue
			}

			// 发送消息，并检查错误
			if err := connect.WriteMessage(websocket.TextMessage, data); err != nil {
				log.Printf("Connection lost (write error): %v. Will attempt to reconnect.", err)
				break // 发送失败，跳出内层循环，触发外层循环的重连逻辑
			}

			// 等待指定间隔
			time.Sleep(time.Millisecond * time.Duration(Config.Interval))
		}
		// 从内层循环跳出后，会延迟一小段时间再进入下一次外层循环的重连尝试
		time.Sleep(1 * time.Second)
	}
}
